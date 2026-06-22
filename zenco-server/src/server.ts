import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { OAuth2Client } from 'google-auth-library';
import rateLimit from 'express-rate-limit';
import { iconsList } from './icons';
import { connectDB, User, OtpRecord, isDBConnected } from './db';
import { generateCaptcha, verifyCaptcha } from './captcha';

dotenv.config();

// Connect to MongoDB Atlas Database
connectDB();

// In-memory fallback stores if MongoDB connection fails
const memoryOtpStore = new Map<string, { otp: string; expiresAt: Date }>();
const memoryUserStore = new Map<string, { email: string; name: string; picture: string }>();

const app = express();
const PORT = process.env.PORT || 5002; // Aligned with the configured port
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_zen_token_key';

// Middlewares
app.use(cors({
  origin: '*', // For development flexibility
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Search-Captcha-Token']
}));
app.use(express.json());

// Setup Nodemailer transporter if config available
let transporter: nodemailer.Transporter | null = null;
const useSMTP = !!(process.env.SMTP_HOST && process.env.SMTP_USER);

if (useSMTP) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// Authentication Middleware
interface AuthenticatedRequest extends Request {
  user?: {
    email: string;
    name?: string;
  };
}

const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Authentication token is required.' });
    return;
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      res.status(403).json({ error: 'Token is invalid or expired.' });
      return;
    }
    req.user = decoded as { email: string; name?: string };
    next();
  });
};

// ==========================================
// Security: Rate Limiters & Captcha Middlewares
// ==========================================

// Global general rate limiter (max 200 requests per 15 minutes per IP)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests from this address. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// Auth Rate Limiter (Max 5 verification code requests per email/IP per hour)
const authOtpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many verification code requests. Please try again in an hour.' },
  keyGenerator: (req) => {
    const email = req.body.email ? String(req.body.email).toLowerCase().trim() : '';
    const ip = req.ip || 'anonymous';
    return email ? `${ip}_${email}` : ip;
  },
  validate: false,
  standardHeaders: true,
  legacyHeaders: false,
});

// Search Rate Limiter (Max 25 queries per IP/user per minute)
const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 25,
  message: { error: 'Search rate limit exceeded. Please wait a minute before searching again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware to verify search captcha session tokens
const verifySearchCaptchaToken = (req: Request, res: Response, next: NextFunction): void => {
  const searchCaptchaToken = req.headers['x-search-captcha-token'];

  if (!searchCaptchaToken) {
    res.status(403).json({ error: 'Captcha verification required to run search queries.', captchaRequired: true });
    return;
  }

  try {
    const decoded = jwt.verify(String(searchCaptchaToken), JWT_SECRET) as { purpose: string };
    if (decoded.purpose !== 'search_session') {
      res.status(403).json({ error: 'Invalid captcha verification token.', captchaRequired: true });
      return;
    }
    next();
  } catch (err) {
    res.status(403).json({ error: 'Your captcha session expired. Please verify you are human.', captchaRequired: true });
  }
};

// ==========================================
// Routes: Captcha Management
// ==========================================

// Endpoint: GET /api/auth/captcha
app.get('/api/auth/captcha', (req: Request, res: Response) => {
  try {
    const captcha = generateCaptcha();
    res.json(captcha);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate captcha puzzle.' });
  }
});

// Endpoint: POST /api/search/verify-captcha (Grants 15-minute Search Captcha Session Token)
app.post('/api/search/verify-captcha', (req: Request, res: Response) => {
  const { captchaAnswer, captchaToken } = req.body;

  if (!verifyCaptcha(captchaToken, captchaAnswer)) {
    res.status(400).json({ error: 'Incorrect captcha answer. Please solve the puzzle again.' });
    return;
  }

  try {
    // Generate a secure token indicating human verification (valid for 15 minutes)
    const searchSessionToken = jwt.sign(
      { purpose: 'search_session' },
      JWT_SECRET,
      { expiresIn: '15m' }
    );
    res.json({ success: true, searchSessionToken });
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify captcha.' });
  }
});

// ==========================================
// Routes: Authentication (MongoDB-backed)
// ==========================================

// Route: Send OTP (rate-limited, protected by Captcha)
app.post('/api/auth/send-otp', authOtpLimiter, async (req: Request, res: Response): Promise<void> => {
  const { email, captchaAnswer, captchaToken } = req.body;

  if (!email || !email.includes('@')) {
    res.status(400).json({ error: 'A valid email address is required.' });
    return;
  }

  // Cryptographic captcha validation
  if (!verifyCaptcha(captchaToken, captchaAnswer)) {
    res.status(400).json({ error: 'Incorrect captcha answer. Please solve the puzzle again.' });
    return;
  }

  const emailLower = email.toLowerCase().trim();
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes validity

  try {
    if (isDBConnected) {
      // Save or upsert OTP record in MongoDB Atlas
      await OtpRecord.findOneAndUpdate(
        { email: emailLower },
        { otp, expiresAt },
        { upsert: true, new: true }
      );
    } else {
      // Save in local memory fallback store
      memoryOtpStore.set(emailLower, { otp, expiresAt });
    }

    console.log(`\n======================================`);
    console.log(`[AUTH SYSTEM] OTP generated for: ${emailLower}`);
    console.log(`[OTP CODE] ==>  ${otp}  <==`);
    console.log(`======================================\n`);

    if (useSMTP && transporter) {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || '"Zenco Search" <noreply@zenco.com>',
        to: emailLower,
        subject: `${otp} is your Zenco Verification Code`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #0b0f19; color: #ffffff;">
            <h2 style="color: #4facfe; text-align: center;">Zenco Authentication</h2>
            <p>Hello,</p>
            <p>You requested a one-time verification code to search for premium icons on Zenco.</p>
            <div style="background: linear-gradient(135deg, #14192d 0%, #08090c 100%); border: 1px solid rgba(79, 172, 254, 0.2); padding: 15px; border-radius: 6px; text-align: center; margin: 20px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #00f2fe;">${otp}</span>
            </div>
            <p style="font-size: 12px; color: #94a3b8;">This code is valid for 5 minutes and can only be used once. If you did not request this, you can safely ignore this email.</p>
            <hr style="border: 0; border-top: 1px solid #1e293b; margin: 20px 0;">
            <p style="text-align: center; font-size: 12px; color: #94a3b8;">© 2026 Zenco. All rights reserved.</p>
          </div>
        `,
      });
      res.json({ success: true, message: 'OTP sent to email successfully.' });
    } else {
      res.json({
        success: true,
        message: 'OTP sent. Development mode active (Check server terminal console for the OTP code).',
        devMode: true
      });
    }
  } catch (error: any) {
    console.error('OTP send failed:', error);
    res.status(500).json({ error: 'Failed to process verification code request.' });
  }
});

// Route: Verify OTP
app.post('/api/auth/verify-otp', async (req: Request, res: Response): Promise<void> => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    res.status(400).json({ error: 'Email and OTP code are required.' });
    return;
  }

  const emailLower = email.toLowerCase().trim();

  try {
    // Check for record
    let record;
    if (isDBConnected) {
      record = await OtpRecord.findOne({ email: emailLower });
    } else {
      const memRecord = memoryOtpStore.get(emailLower);
      if (memRecord && memRecord.expiresAt.getTime() > Date.now()) {
        record = memRecord;
      }
    }

    if (!record) {
      res.status(400).json({ error: 'No OTP requested for this email, or it has expired.' });
      return;
    }

    if (record.otp !== otp.trim()) {
      res.status(400).json({ error: 'Incorrect verification code. Please check and try again.' });
      return;
    }

    // OTP is correct! Clear OTP
    if (isDBConnected) {
      await OtpRecord.deleteOne({ email: emailLower });
    } else {
      memoryOtpStore.delete(emailLower);
    }

    // Fetch user or create if they don't exist
    let user;
    if (isDBConnected) {
      user = await User.findOne({ email: emailLower });
      if (!user) {
        user = await User.create({
          email: emailLower,
          name: emailLower.split('@')[0],
          picture: ''
        });
      }
    } else {
      const existingUser = memoryUserStore.get(emailLower);
      if (existingUser) {
        user = existingUser;
      } else {
        user = {
          email: emailLower,
          name: emailLower.split('@')[0],
          picture: ''
        };
        memoryUserStore.set(emailLower, user);
      }
    }

    // Generate token
    const token = jwt.sign({ email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      user: {
        email: user.email,
        name: user.name,
        picture: user.picture
      }
    });
  } catch (err: any) {
    console.error('OTP Verification error:', err);
    res.status(500).json({ error: 'Failed to verify verification code.' });
  }
});

// Route: Google Authentication
app.post('/api/auth/google', async (req: Request, res: Response): Promise<void> => {
  const { credential, captchaAnswer, captchaToken } = req.body;

  if (!credential) {
    res.status(400).json({ error: 'Google Credential token is required.' });
    return;
  }

  // Cryptographic captcha validation
  if (!verifyCaptcha(captchaToken, captchaAnswer)) {
    res.status(400).json({ error: 'Incorrect captcha answer. Please solve the puzzle again.' });
    return;
  }

  try {
    let email: string = '';
    let name: string = '';
    let picture: string = '';

    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const isSandboxToken = credential.startsWith('sandbox_token_') || credential.split('.').length !== 3;

    if (!googleClientId || isSandboxToken) {
      // Sandbox fallback mode - decode token without verification
      console.log('[AUTH SYSTEM] Sandbox or simulated token detected. Using sandbox fallback.');
      const decoded: any = jwt.decode(credential);
      if (decoded && decoded.email) {
        email = decoded.email;
        name = decoded.name || email.split('@')[0];
        picture = decoded.picture || '';
      } else {
        email = 'sandbox.google@zenco.com';
        name = 'Sayan Maity';
        picture = '';
      }
    } else {
      // Production verification
      const client = new OAuth2Client(googleClientId);
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: googleClientId,
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        res.status(400).json({ error: 'Invalid Google credential.' });
        return;
      }
      email = payload.email;
      name = payload.name || email.split('@')[0];
      picture = payload.picture || '';
    }

    const emailLower = email.toLowerCase().trim();

    // Check or create/update user
    let user;
    if (isDBConnected) {
      user = await User.findOne({ email: emailLower });
      if (!user) {
        user = await User.create({
          email: emailLower,
          name,
          picture
        });
      } else if (picture && user.picture !== picture) {
        user.picture = picture;
        await user.save();
      }
    } else {
      const existingUser = memoryUserStore.get(emailLower);
      if (existingUser) {
        user = existingUser;
        if (picture && user.picture !== picture) {
          user.picture = picture;
        }
      } else {
        user = {
          email: emailLower,
          name,
          picture
        };
        memoryUserStore.set(emailLower, user);
      }
    }

    const token = jwt.sign({ email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      user: {
        email: user.email,
        name: user.name,
        picture: user.picture
      }
    });
  } catch (error: any) {
    console.error('Google Sign-in Error:', error);
    res.status(400).json({ error: 'Google authentication failed: ' + error.message });
  }
});

// ==========================================
// Route: Icon Search (Protected & Rate Limited)
// ==========================================
app.get('/api/search', authenticateToken, verifySearchCaptchaToken, searchLimiter, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const query = req.query.q ? String(req.query.q).toLowerCase().trim() : '';

  if (!query) {
    res.json({ results: [] });
    return;
  }

  try {
    const synonymMap: { [key: string]: string[] } = {
      'settings': ['cog', 'gear', 'cogs'],
      'cog': ['settings', 'gear', 'cogs'],
      'gear': ['settings', 'cog', 'cogs'],
      'search': ['find', 'magnifier'],
      'find': ['search', 'magnifier'],
      'edit': ['pencil', 'write', 'pen'],
      'pencil': ['edit', 'write', 'pen'],
      'trash': ['delete', 'remove', 'bin'],
      'delete': ['trash', 'remove', 'bin'],
      'heart': ['love', 'like', 'favorite'],
      'love': ['heart', 'like', 'favorite'],
      'user': ['profile', 'avatar', 'person'],
      'profile': ['user', 'avatar', 'person'],
      'bell': ['notification', 'alert'],
      'notification': ['bell', 'alert'],
      'power': ['logout', 'exit', 'shutdown'],
      'logout': ['power', 'exit', 'shutdown'],
      'calendar': ['date', 'schedule', 'event'],
      'date': ['calendar', 'schedule', 'event'],
      'message': ['chat', 'talk', 'bubble'],
      'chat': ['message', 'talk', 'bubble'],
      'key': ['lock', 'password', 'access'],
      'lock': ['key', 'password', 'access'],
      'image': ['picture', 'photo', 'gallery'],
      'picture': ['image', 'photo', 'gallery'],
      'code': ['developer', 'terminal'],
      'terminal': ['code', 'developer'],
      'home': ['house', 'main'],
      'house': ['home', 'main']
    };

    const termsToSearch = [query];
    const lowerQuery = query.toLowerCase().trim();
    if (synonymMap[lowerQuery]) {
      termsToSearch.push(...synonymMap[lowerQuery].slice(0, 2));
    }

    const urls: string[] = [
      `https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=32`
    ];

    const premiumPrefixes = [
      { key: 'la', limit: 8 },
      { key: 'line-md', limit: 8 },
      { key: 'flat-color-icons', limit: 8 },
      { key: 'fa6-solid,fa6-regular,fa6-brands', limit: 8 },
      { key: 'solar', limit: 8 }
    ];

    termsToSearch.forEach((term) => {
      premiumPrefixes.forEach((pref) => {
        urls.push(`https://api.iconify.design/search?query=${encodeURIComponent(term)}&prefixes=${pref.key}&limit=${pref.limit}`);
      });
    });

    const fetchSearchData = async (url: string): Promise<string[]> => {
      try {
        const res = await fetch(url);
        if (!res.ok) return [];
        const data: any = await res.json();
        return data && Array.isArray(data.icons) ? data.icons : [];
      } catch (err) {
        console.error(`Failed search fetch for ${url}:`, err);
        return [];
      }
    };

    const searchResponses = await Promise.all(urls.map(fetchSearchData));
    const allIconNames = Array.from(new Set(searchResponses.flat()));

    if (allIconNames.length > 0) {
      const groups: { [prefix: string]: string[] } = {};
      allIconNames.forEach((iconName: string) => {
        const parts = iconName.split(':');
        if (parts.length === 2) {
          const [prefix, name] = parts;
          if (!groups[prefix]) {
            groups[prefix] = [];
          }
          groups[prefix].push(name);
        }
      });

      const fetchPromises = Object.entries(groups).map(async ([prefix, names]) => {
        try {
          const url = `https://api.iconify.design/${prefix}.json?icons=${names.join(',')}`;
          const res = await fetch(url);
          if (!res.ok) return null;
          const data = await res.json();
          return { prefix, data };
        } catch (err) {
          console.error(`Failed to fetch icons for prefix ${prefix}:`, err);
          return null;
        }
      });

      const collections = await Promise.all(fetchPromises);

      const libraryMap: { [prefix: string]: string } = {
        'lucide': 'Lucide',
        'fe': 'Feather Icons',
        'feather': 'Feather Icons',
        'mdi': 'Material Design Icons',
        'material-symbols': 'Material Symbols',
        'ic': 'Material Icons',
        'ph': 'Phosphor',
        'ri': 'Remix Icon',
        'bi': 'Bootstrap Icons',
        'tabler': 'Tabler Icons',
        'heroicons': 'Heroicons',
        'octicon': 'Octicons',
        'carbon': 'Carbon Icons',
        'ant-design': 'Ant Design Icons',
        'fluent': 'Fluent UI Icons',
        'line-md': 'LottieFiles',
        'la': 'Icons8',
        'fc': 'Flaticon',
        'flat-color-icons': 'Flaticon',
        'solar': 'SVGRepo',
        'fa': 'FontAwesome',
        'fa-solid': 'FontAwesome',
        'fa-regular': 'FontAwesome',
        'fa-brands': 'FontAwesome',
        'fa6-solid': 'FontAwesome',
        'fa6-regular': 'FontAwesome',
        'fa6-brands': 'FontAwesome',
        'ion': 'Ionicons',
        'radix-icons': 'Radix Icons',
        'akar-icons': 'Akar Icons',
        'iconoir': 'Iconoir',
        'logos': 'Brand Logos'
      };

      const getLibraryName = (prefix: string): string => {
        if (libraryMap[prefix]) return libraryMap[prefix];
        return prefix.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      };

      const getIconStyle = (prefix: string, name: string): string => {
        const lowerName = name.toLowerCase();
        const lowerPrefix = prefix.toLowerCase();
        if (
          lowerPrefix.includes('solid') || 
          lowerPrefix.includes('fill') || 
          lowerName.includes('solid') || 
          lowerName.includes('fill') || 
          lowerName.endsWith('-f') || 
          lowerName.endsWith('-s')
        ) {
          return 'Solid';
        }
        if (lowerPrefix.includes('flat') || lowerName.includes('flat') || lowerPrefix.includes('color')) {
          return 'Flat';
        }
        if (lowerName.includes('minimalist') || lowerPrefix.includes('minimalist')) {
          return 'Minimalist';
        }
        return 'Outline';
      };

      const results: any[] = [];

      collections.forEach((col: any) => {
        if (!col || !col.data || !col.data.icons) return;
        const prefix = col.prefix;
        const data = col.data;

        Object.entries(data.icons).forEach(([name, iconData]: [string, any]) => {
          const width = iconData.width || data.width || 24;
          const height = iconData.height || data.height || 24;

          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${width} ${height}">${iconData.body}</svg>`;

          let sourceUrl = `https://icon-sets.iconify.design/${prefix}/${name}`;
          if (prefix === 'la' || prefix === 'flat-color-icons') {
            sourceUrl = `https://icons8.com/icons/set/${name}`;
          } else if (prefix === 'line-md') {
            sourceUrl = `https://lottiefiles.com/search?q=${name}`;
          } else if (prefix === 'solar') {
            sourceUrl = `https://svgrepo.com/vectors/${name}`;
          } else if (prefix.startsWith('fa')) {
            sourceUrl = `https://fontawesome.com/icons/${name}`;
          }

          results.push({
            id: `${prefix}-${name}`,
            name: name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
            library: getLibraryName(prefix),
            style: getIconStyle(prefix, name),
            svg,
            sourceUrl
          });
        });
      });

      if (results.length > 0) {
        res.json({
          results,
          query,
          count: results.length,
          provider: 'Iconify CDN API'
        });
        return;
      }
    }
  } catch (error) {
    console.error('Iconify Search failed:', error);
  }

  // Fallback
  const results = iconsList.filter(icon => {
    return icon.name.toLowerCase().includes(query) ||
           icon.category.toLowerCase().includes(query) ||
           icon.tags.some(tag => tag.toLowerCase().includes(query));
  }).map(icon => ({
    id: icon.id,
    name: icon.name,
    library: 'Lucide',
    style: 'Outline',
    svg: icon.svg,
    sourceUrl: `https://lucide.dev/icons/${icon.id}`
  }));

  res.json({
    results,
    query,
    count: results.length,
    provider: 'Local Cache Fallback'
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`\n🚀 Zenco Server is running on: http://localhost:${PORT}`);
  console.log(`🔧 Mode: ${useSMTP ? 'SMTP Email Authentication Enabled' : 'Console OTP Log Fallback'}`);
  if (!process.env.GOOGLE_CLIENT_ID) {
    console.log(`⚠️ Google Sign-In running in local sandbox fallback mode (will accept simulated logins).`);
  }
  console.log(`======================================\n`);
});
