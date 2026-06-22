import jwt from 'jsonwebtoken';

const CAPTCHA_SECRET = process.env.JWT_SECRET || 'super_secret_zen_captcha_key_12345';

export interface CaptchaData {
  svg: string;
  token: string;
}

/**
 * Generates a mathematical captcha (addition or subtraction),
 * builds an OCR-resistant SVG representation, and signs the answer in a short-lived JWT token.
 */
export const generateCaptcha = (): CaptchaData => {
  const isAddition = Math.random() > 0.5;
  let equation = '';
  let solution = 0;

  if (isAddition) {
    const a = Math.floor(Math.random() * 15) + 2; // 2 to 16
    const b = Math.floor(Math.random() * 14) + 1; // 1 to 14
    equation = `${a} + ${b}`;
    solution = a + b;
  } else {
    const a = Math.floor(Math.random() * 20) + 10; // 10 to 29
    const b = Math.floor(Math.random() * 8) + 1;  // 1 to 8
    equation = `${a} - ${b}`;
    solution = a - b;
  }

  const width = 130;
  const height = 44;

  // Add random background visual noise (lines)
  let noise = '';
  for (let i = 0; i < 5; i++) {
    const x1 = Math.floor(Math.random() * width);
    const y1 = Math.floor(Math.random() * height);
    const x2 = Math.floor(Math.random() * width);
    const y2 = Math.floor(Math.random() * height);
    // Use semi-transparent white/cyan lines
    const strokeColor = i % 2 === 0 ? 'rgba(0, 242, 254, 0.25)' : 'rgba(79, 172, 254, 0.25)';
    noise += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${strokeColor}" stroke-width="1.5" />`;
  }

  // Add random dots
  for (let i = 0; i < 20; i++) {
    const cx = Math.floor(Math.random() * width);
    const cy = Math.floor(Math.random() * height);
    const r = Math.floor(Math.random() * 1.5) + 1;
    noise += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(255, 255, 255, 0.15)" />`;
  }

  // Text transformations to impede automated reading (rotation and skew)
  const skewX = Math.floor(Math.random() * 12) - 6; // -6deg to +6deg
  const rotate = Math.floor(Math.random() * 8) - 4; // -4deg to +4deg
  const transform = `skewX(${skewX}) rotate(${rotate})`;

  const textStyle = `
    fill: #00f2fe;
    font-family: 'Plus Jakarta Sans', 'Outfit', sans-serif;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 2px;
    filter: drop-shadow(0 2px 4px rgba(0, 242, 254, 0.2));
  `;

  // Standard inline SVG containing noise and the equation
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="background: rgba(14, 18, 30, 0.7); border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.08); user-select: none;">
      ${noise}
      <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" style="${textStyle}" transform="translate(${width / 2}, ${height / 2}) ${transform} translate(-${width / 2}, -${height / 2})">${equation} =</text>
    </svg>
  `.trim();

  // Create JWT token encapsulating the solution (expires in 2 minutes)
  const token = jwt.sign(
    { solution: String(solution) },
    CAPTCHA_SECRET,
    { expiresIn: '2m' }
  );

  return { svg, token };
};

/**
 * Validates the solution against the token's encrypted payload.
 */
export const verifyCaptcha = (token: string, answer: string): boolean => {
  if (!token || !answer) return false;

  try {
    const decoded = jwt.verify(token, CAPTCHA_SECRET) as { solution: string };
    return decoded.solution === answer.trim();
  } catch (err) {
    return false; // Token expired or invalid signature
  }
};
