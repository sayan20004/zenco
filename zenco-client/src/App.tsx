import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import './App.css'

interface IconItem {
  id: string;
  name: string;
  library: string;
  style: string;
  svg: string;
  sourceUrl: string;
}

interface UserProfile {
  email: string;
  name: string;
  picture?: string;
}

interface ExternalLibrary {
  id: string;
  name: string;
  url: (query: string) => string;
  color: string;
  description: string;
  category: string;
  logo: string;
}

const EXTERNAL_LIBRARIES: ExternalLibrary[] = [
  {
    id: 'icons8',
    name: 'Icons8',
    url: (q) => `https://icons8.com/icons/set/${encodeURIComponent(q)}`,
    color: '#1fb381',
    description: 'Explore 3D graphics, animations, PNG & vector icon sets in any style.',
    category: 'Icons, 3D & Lottie',
    logo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 32px; height: 32px;"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>`
  },
  {
    id: 'lottiefiles',
    name: 'LottieFiles',
    url: (q) => `https://lottiefiles.com/search?q=${encodeURIComponent(q)}`,
    color: '#0df2c9',
    description: 'Millions of lightweight, interactive, high-performance Lottie animations.',
    category: 'Lotties & Motion',
    logo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 32px; height: 32px;"><polygon points="6 2 18 2 18 6 6 6"/><polygon points="6 18 18 18 18 22 6 22"/><path d="M12 6v12M8 10h8M8 14h8"/></svg>`
  },
  {
    id: 'flaticon',
    name: 'Flaticon',
    url: (q) => `https://www.flaticon.com/search?word=${encodeURIComponent(q)}`,
    color: '#1273eb',
    description: 'Largest database of free vector icons, UI buttons, and stickers.',
    category: 'Vectors & Stickers',
    logo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 32px; height: 32px;"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`
  },
  {
    id: 'svgrepo',
    name: 'SVGRepo',
    url: (q) => `https://www.svgrepo.com/vectors/${encodeURIComponent(q)}/`,
    color: '#f0932b',
    description: 'Free SVG vectors and illustrations optimized for commercial use.',
    category: 'Free SVG Vectors',
    logo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 32px; height: 32px;"><path d="M16.5 9.4 12 14.3 7.5 9.4"/><path d="M21 16V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z"/></svg>`
  },
  {
    id: 'fontawesome',
    name: 'FontAwesome',
    url: (q) => `https://fontawesome.com/search?q=${encodeURIComponent(q)}&o=r`,
    color: '#528ddb',
    description: 'The standard vector icon toolkit for web designers and developers.',
    category: 'Font Icons & Toolkit',
    logo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 32px; height: 32px;"><path d="M4 22V2h10l2 4H6v6h8l2 4H6v6"/></svg>`
  }
];

const formatPremiumSvg = (svgStr: string) => {
  if (!svgStr) return '';
  if (svgStr.includes('style=')) {
    return svgStr.replace(/style="[^"]*"/, 'style="width: 32px; height: 32px; flex-shrink: 0;"');
  }
  return svgStr.replace(/<svg/i, '<svg style="width: 32px; height: 32px; flex-shrink: 0;"');
};

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const isGoogleConfigured = !!GOOGLE_CLIENT_ID;
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5002';

function App() {
  const decorationsRef = useRef<HTMLDivElement>(null)

  // Search and Auth States
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [searchResults, setSearchResults] = useState<IconItem[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  // Captcha States
  const [captchaSvg, setCaptchaSvg] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaAnswer, setCaptchaAnswer] = useState('')

  // Search Captcha States
  const [showSearchCaptchaModal, setShowSearchCaptchaModal] = useState(false)
  const [searchCaptchaSvg, setSearchCaptchaSvg] = useState('')
  const [searchCaptchaToken, setSearchCaptchaToken] = useState('')
  const [searchCaptchaAnswer, setSearchCaptchaAnswer] = useState('')
  const [searchCaptchaError, setSearchCaptchaError] = useState('')
  const [searchCaptchaCallback, setSearchCaptchaCallback] = useState<(() => void) | null>(null)

  // Auth State
  const [user, setUser] = useState<UserProfile | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authStep, setAuthStep] = useState<'email' | 'otp' | 'google-captcha'>('email')
  const [useGsiButton, setUseGsiButton] = useState(isGoogleConfigured)
  const [tempGoogleCredential, setTempGoogleCredential] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [otpInput, setOtpInput] = useState<string[]>(Array(6).fill(''))
  const [otpError, setOtpError] = useState('')
  const [otpSuccessMsg, setOtpSuccessMsg] = useState('')
  const [pendingQuery, setPendingQuery] = useState('')
  const [resendTimer, setResendTimer] = useState(0)
  const [showProfilePopover, setShowProfilePopover] = useState(false)

  // Filtering & Love/Favorite states
  const [selectedLibrary, setSelectedLibrary] = useState<string>('All')
  const [selectedStyle, setSelectedStyle] = useState<string>('All')
  const [favorites, setFavorites] = useState<string[]>([])
  const [showOnlyFavorites, setShowOnlyFavorites] = useState<boolean>(false)

  // Feedback states
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success')

  // OTP inputs references
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  // Load user session and favorites on start
  useEffect(() => {
    const savedToken = localStorage.getItem('zen_token')
    const savedUser = localStorage.getItem('zen_user')
    if (savedToken && savedUser) {
      setToken(savedToken)
      setUser(JSON.parse(savedUser))
    }

    const savedFavs = localStorage.getItem('zen_favs')
    if (savedFavs) {
      setFavorites(JSON.parse(savedFavs))
    }
  }, [])

  // Close profile popover when clicking anywhere else
  useEffect(() => {
    if (!showProfilePopover) return
    const handleOutsideClick = () => {
      setShowProfilePopover(false)
    }
    document.addEventListener('click', handleOutsideClick)
    return () => document.removeEventListener('click', handleOutsideClick)
  }, [showProfilePopover])

  // Parallax and shape spin effects (Original code preserved)
  useEffect(() => {
    if (!decorationsRef.current) return

    const layers = decorationsRef.current.querySelectorAll('.parallax-layer')
    const shapes = decorationsRef.current.querySelectorAll('.shape:not(.dome)')

    shapes.forEach((shape, index) => {
      const floatDistance = 15 + index * 5
      const floatDuration = 4 + index * 0.8

      gsap.to(shape, {
        y: -floatDistance,
        duration: floatDuration,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        delay: index * 0.2
      })

      if (
        shape.classList.contains('ring') ||
        shape.classList.contains('flower') ||
        shape.classList.contains('diamond') ||
        shape.classList.contains('hourglass') ||
        shape.classList.contains('asterisk')
      ) {
        const spinDuration = 20 + index * 6
        const spinDirection = index % 2 === 0 ? 360 : -360
        gsap.to(shape, {
          rotation: spinDirection,
          duration: spinDuration,
          repeat: -1,
          ease: "none"
        })
      }
    })

    const handleMouseMove = (e: MouseEvent) => {
      const { clientX, clientY } = e
      const { innerWidth, innerHeight } = window

      const normX = (clientX / innerWidth) - 0.5
      const normY = (clientY / innerHeight) - 0.5

      layers.forEach((layer) => {
        const depthAttr = layer.getAttribute('data-depth')
        const depth = depthAttr ? parseFloat(depthAttr) : 0.2
        const moveLimit = depth * 60

        gsap.to(layer, {
          x: normX * moveLimit,
          y: normY * moveLimit,
          duration: 1.5,
          ease: "power2.out",
          overwrite: "auto"
        })
      })
    }

    window.addEventListener('mousemove', handleMouseMove)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      gsap.killTweensOf(shapes)
      gsap.killTweensOf(layers)
    }
  }, [])

  // Timer for OTP resending
  useEffect(() => {
    if (resendTimer <= 0) return
    const interval = setInterval(() => {
      setResendTimer(prev => prev - 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [resendTimer])

  // Google GSI script initialization inside modal
  useEffect(() => {
    if (!showAuthModal) return
    if (!isGoogleConfigured) {
      setUseGsiButton(false)
      return
    }

    setUseGsiButton(true)
    let attempts = 0
    const interval = setInterval(() => {
      attempts++
      // @ts-ignore
      if (window.google && typeof window.google.accounts !== 'undefined') {
        clearInterval(interval)
        try {
          // @ts-ignore
          window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: (response: any) => {
              handleGoogleLogin(response.credential)
            }
          })

          const btnContainer = document.getElementById('google-gsi-btn-container')
          if (btnContainer) {
            // @ts-ignore
            window.google.accounts.id.renderButton(
              btnContainer,
              { theme: 'dark', size: 'large', width: '320', shape: 'pill' }
            )
          }
        } catch (err) {
          console.warn('Google GSI init failed (sandbox fallback active)', err)
          setUseGsiButton(false)
        }
      } else if (attempts >= 30) { // 3 seconds timeout
        clearInterval(interval)
        console.warn('Google GSI script failed to load. Falling back to sandbox button.')
        setUseGsiButton(false)
      }
    }, 100)

    return () => clearInterval(interval)
  }, [showAuthModal])

  // Captcha Fetching & Verifying Handlers
  const fetchAuthCaptcha = async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/captcha`);
      if (res.ok) {
        const data = await res.json();
        setCaptchaSvg(data.svg);
        setCaptchaToken(data.token);
        setCaptchaAnswer('');
      }
    } catch (err) {
      console.error('Failed to load login captcha', err);
    }
  };

  const fetchSearchCaptcha = async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/captcha`);
      if (res.ok) {
        const data = await res.json();
        setSearchCaptchaSvg(data.svg);
        setSearchCaptchaToken(data.token);
        setSearchCaptchaAnswer('');
        setSearchCaptchaError('');
      }
    } catch (err) {
      console.error('Failed to load search captcha', err);
    }
  };

  useEffect(() => {
    if (showAuthModal && (authStep === 'email' || authStep === 'google-captcha')) {
      fetchAuthCaptcha();
    }
  }, [showAuthModal, authStep]);

  useEffect(() => {
    if (showSearchCaptchaModal) {
      fetchSearchCaptcha();
    }
  }, [showSearchCaptchaModal]);

  const handleVerifySearchCaptcha = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchCaptchaAnswer.trim()) {
      setSearchCaptchaError('Please enter the captcha answer.');
      return;
    }

    setSearchCaptchaError('');

    try {
      const res = await fetch(`${API_URL}/api/search/verify-captcha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          captchaAnswer: searchCaptchaAnswer,
          captchaToken: searchCaptchaToken
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('zen_search_captcha_token', data.searchSessionToken);
        setShowSearchCaptchaModal(false);
        triggerToast('Human verification successful!', 'success');
        
        if (searchCaptchaCallback) {
          searchCaptchaCallback();
          setSearchCaptchaCallback(null);
        }
      } else {
        setSearchCaptchaError(data.error || 'Verification failed. Try again.');
        fetchSearchCaptcha();
      }
    } catch (err) {
      setSearchCaptchaError('Failed to verify captcha with server.');
    }
  };

  // Show customized Toast notifications
  const triggerToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage(msg)
    setToastType(type)
    setTimeout(() => {
      setToastMessage(null)
    }, 4000)
  }

  // Trigger search logic
  const performSearch = async (query: string, activeToken: string) => {
    if (!query.trim()) return
    setIsSearching(true)
    setHasSearched(true)
    setActiveSearch(query)

    try {
      const searchCaptchaToken = localStorage.getItem('zen_search_captcha_token') || '';
      const res = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(query)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${activeToken}`,
          'X-Search-Captcha-Token': searchCaptchaToken
        }
      })
      const data = await res.json()
      if (res.ok) {
        setSearchResults(data.results || [])
        // GSAP animate results entrance
        setTimeout(() => {
          gsap.fromTo('.icon-card',
            { opacity: 0, y: 15 },
            { opacity: 1, y: 0, duration: 0.5, stagger: 0.05, ease: "power2.out" }
          )
        }, 50)
      } else {
        if (res.status === 403 && data.captchaRequired) {
          // Open search captcha verification modal
          setSearchCaptchaCallback(() => () => performSearch(query, activeToken));
          setShowSearchCaptchaModal(true);
          setIsSearching(false);
          return;
        }
        triggerToast(data.error || 'Search request failed', 'error')
        if (res.status === 401 || (res.status === 403 && !data.captchaRequired)) {
          handleLogout()
        }
      }
    } catch (err) {
      triggerToast('Unable to reach server. Is the backend running?', 'error')
    } finally {
      setIsSearching(false)
    }
  }

  // Handle Search Input Submission
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return

    if (!token) {
      // User is not logged in - hold query and prompt login
      setPendingQuery(searchQuery)
      setAuthStep('email')
      setOtpError('')
      setOtpSuccessMsg('')
      setShowAuthModal(true)
    } else {
      performSearch(searchQuery, token)
    }
  }

  // Send OTP handler
  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!emailInput || !emailInput.includes('@')) {
      setOtpError('Please enter a valid email address.')
      return
    }

    setOtpError('')
    setOtpSuccessMsg('')

    try {
      const res = await fetch(`${API_URL}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailInput,
          captchaAnswer: captchaAnswer,
          captchaToken: captchaToken
        })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setAuthStep('otp')
        setResendTimer(60)

        if (data.devMode) {
          setOtpSuccessMsg('Development Mode: OTP logged to backend console!')
          triggerToast('OTP logged to backend terminal!', 'info')
        } else {
          setOtpSuccessMsg('Verification code sent to your email.')
          triggerToast('Verification code sent!', 'success')
        }

        // Focus first OTP box
        setTimeout(() => {
          otpRefs.current[0]?.focus()
        }, 100)
      } else {
        setOtpError(data.error || 'Failed to send OTP. Please try again.')
        fetchAuthCaptcha(); // Refresh captcha
      }
    } catch (err) {
      setOtpError('Failed to connect to backend server.')
    }
  }

  // Verify OTP handler
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    const otpCode = otpInput.join('')
    if (otpCode.length < 6) {
      setOtpError('Please enter the full 6-digit code.')
      return
    }

    setOtpError('')

    try {
      const res = await fetch(`${API_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput, otp: otpCode })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        localStorage.setItem('zen_token', data.token)
        localStorage.setItem('zen_user', JSON.stringify(data.user))
        setToken(data.token)
        setUser(data.user)
        setShowAuthModal(false)
        triggerToast(`Welcome back, ${data.user.name}!`, 'success')

        // Clear auth inputs
        setEmailInput('')
        setOtpInput(Array(6).fill(''))

        // Run pending search
        if (pendingQuery) {
          performSearch(pendingQuery, data.token)
          setPendingQuery('')
        }
      } else {
        setOtpError(data.error || 'Verification failed. Incorrect code.')
      }
    } catch (err) {
      setOtpError('Failed to verify OTP with server.')
    }
  }

  // Google Login Callback (Handles both GSI response and Mock click)
  const handleGoogleLogin = async (googleCredentialToken?: string) => {
    setOtpError('')
    const credential = googleCredentialToken || `sandbox_token_${Math.random().toString(36).substring(7)}`
    setTempGoogleCredential(credential)
    setCaptchaAnswer('')
    setAuthStep('google-captcha')
  }

  // Submit Handler for Google Captcha Verification
  const handleGoogleCaptchaSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setOtpError('')

    if (!captchaAnswer.trim()) {
      setOtpError('Please enter the captcha answer.')
      return
    }

    try {
      const res = await fetch(`${API_URL}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential: tempGoogleCredential,
          captchaAnswer,
          captchaToken
        })
      })
      const data = await res.json()

      if (res.ok && data.success) {
        localStorage.setItem('zen_token', data.token)
        localStorage.setItem('zen_user', JSON.stringify(data.user))
        setToken(data.token)
        setUser(data.user)
        setShowAuthModal(false)
        setTempGoogleCredential('')
        setCaptchaAnswer('')
        triggerToast(`Signed in with Google as ${data.user.name}`, 'success')

        // Run pending search
        if (pendingQuery) {
          performSearch(pendingQuery, data.token)
          setPendingQuery('')
        }
      } else {
        setOtpError(data.error || 'Google login verification failed.')
        fetchAuthCaptcha()
        setCaptchaAnswer('')
      }
    } catch (err) {
      setOtpError('Could not verify Google login with the backend server.')
      fetchAuthCaptcha()
      setCaptchaAnswer('')
    }
  }

  // Logout handler
  const handleLogout = () => {
    localStorage.removeItem('zen_token')
    localStorage.removeItem('zen_user')
    localStorage.removeItem('zen_search_captcha_token')
    setToken(null)
    setUser(null)
    setSearchResults([])
    setHasSearched(false)
    setSearchQuery('')
    setActiveSearch('')
    triggerToast('Logged out successfully.', 'info')
  }

  // Input controller for the 6 OTP input boxes
  const handleOtpBoxChange = (val: string, index: number) => {
    if (!/^[0-9]?$/.test(val)) return // numbers only

    const newOtp = [...otpInput]
    newOtp[index] = val
    setOtpInput(newOtp)

    if (val !== '' && index < 5) {
      otpRefs.current[index + 1]?.focus()
    }
  }

  const handleOtpBoxKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace' && otpInput[index] === '' && index > 0) {
      otpRefs.current[index - 1]?.focus()
    }
  }

  // Copy Icon SVG Markup Helper
  const handleCopySVG = (svgMarkup: string, iconId: string) => {
    navigator.clipboard.writeText(svgMarkup)
      .then(() => {
        triggerToast('SVG copied to clipboard!', 'success')
        // We can temporarily animate or show feedback for the copied card
        const cardEl = document.getElementById(`icon-card-${iconId}`)
        if (cardEl) {
          gsap.fromTo(cardEl,
            { scale: 0.96 },
            { scale: 1, duration: 0.3, ease: "elastic.out(1, 0.3)" }
          )
        }
      })
      .catch(() => {
        triggerToast('Failed to copy SVG', 'error')
      })
  }

  // Toggle Favorite
  const toggleFavorite = (iconId: string) => {
    let updated: string[] = []
    if (favorites.includes(iconId)) {
      updated = favorites.filter(id => id !== iconId)
      triggerToast('Removed from loved icons', 'info')
    } else {
      updated = [...favorites, iconId]
      triggerToast('Added to loved icons!', 'success')
    }
    setFavorites(updated)
    localStorage.setItem('zen_favs', JSON.stringify(updated))
  }

  // Reset selected library filter if it is no longer present in search results and not an external library
  useEffect(() => {
    const isExternal = ['Icons8', 'LottieFiles', 'Flaticon', 'SVGRepo', 'FontAwesome'].includes(selectedLibrary);
    if (selectedLibrary !== 'All' && !isExternal && !searchResults.some(icon => icon.library === selectedLibrary)) {
      setSelectedLibrary('All');
    }
  }, [searchResults, selectedLibrary]);

  // Libraries and styles definitions (Dynamically extracted from results + external directories)
  const dynamicLibraries = Array.from(new Set(searchResults.map(icon => icon.library)));
  const staticLibraries = ['Icons8', 'LottieFiles', 'Flaticon', 'SVGRepo', 'FontAwesome'];
  const librariesList = ['All', ...Array.from(new Set([...dynamicLibraries, ...staticLibraries]))];
  const stylesList = ['All', 'Outline', 'Solid', 'Flat', 'Minimalist']

  // Filtered Icons Grid Logic
  const filteredResults = searchResults.filter(icon => {
    const matchesLibrary = selectedLibrary === 'All' || icon.library === selectedLibrary;
    const matchesStyle = selectedStyle === 'All' || icon.style === selectedStyle;
    const matchesFavorite = !showOnlyFavorites || favorites.includes(icon.id);
    return matchesLibrary && matchesStyle && matchesFavorite;
  });

  return (
    <>
      {/* Toast Alert Banner */}
      {toastMessage && (
        <div className={`toast-alert toast-${toastType}`}>
          <div className="toast-content">
            <span className="toast-icon">
              {toastType === 'success' && '✓'}
              {toastType === 'error' && '✕'}
              {toastType === 'info' && 'ℹ'}
            </span>
            <span className="toast-text">{toastMessage}</span>
          </div>
        </div>
      )}

      <div className="container">
        {/* User profile & header elements */}
        <header className="app-header">
          <div className="logo-section">
            <span className="logo-glow"></span>
            <span className="logo-title">ZENCO</span>
          </div>
          {user ? (
            <div className="profile-badge" onClick={(e) => {
              e.stopPropagation();
              setShowProfilePopover(!showProfilePopover);
            }}>
              {user.picture ? (
                <img src={user.picture} alt={user.name} className="profile-img" />
              ) : (
                <div className="profile-avatar">{user.name[0].toUpperCase()}</div>
              )}
              <div className={`profile-info-popover ${showProfilePopover ? 'show' : ''}`} onClick={(e) => e.stopPropagation()}>
                <p className="popover-name">{user.name}</p>
                <p className="popover-email">{user.email}</p>
                <button className="logout-btn" onClick={() => {
                  setShowProfilePopover(false);
                  handleLogout();
                }}>
                  Logout
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg>
                </button>
              </div>
            </div>
          ) : (
            <button className="header-login-btn" onClick={() => {
              setAuthStep('email');
              setOtpError('');
              setOtpSuccessMsg('');
              setShowAuthModal(true);
            }}>Sign In</button>
          )}
        </header>

        {/* Decorative Floating shapes (Original layout) */}
        <div className="decorations" ref={decorationsRef}>
          <div className="parallax-layer" data-depth="0.15">
            <div className="shape ring"></div>
          </div>

          <div className="parallax-layer" data-depth="0.28">
            <div className="shape flower">
              <div className="petal petal-1"></div>
              <div className="petal petal-2"></div>
            </div>
          </div>

          <div className="parallax-layer" data-depth="0.12">
            <div className="shape diamond"></div>
          </div>

          <div className="parallax-layer" data-depth="0.32">
            <div className="shape hourglass"></div>
          </div>

          <div className="parallax-layer" data-depth="0.22">
            <div className="shape asterisk">
              <div className="arm arm-1"></div>
              <div className="arm arm-2"></div>
              <div className="arm arm-3"></div>
              <div className="arm arm-4"></div>
            </div>
          </div>

          <div className="parallax-layer" data-depth="0.18">
            <div className="shape connector">
              <div className="node square left"></div>
              <div className="node square right"></div>
              <div className="curve"></div>
              <div className="dashed-line left"></div>
              <div className="dashed-line right"></div>
              <div className="node circle left"></div>
              <div className="node circle right"></div>
            </div>
          </div>

          <div className="shape dome"></div>
        </div>

        {/* Main Content Layout */}
        <div className={`main-content ${hasSearched ? 'has-results' : ''}`}>
          <h1 className="greeting">What's next, Sayan?</h1>

          <form onSubmit={handleSearchSubmit} className="search-bar-form">
            <div className="search-bar">
              <input
                type="text"
                className="input-field"
                placeholder="Ask Zeno (e.g. key, setting, user, code...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button type="submit" className="icon-btn" aria-label="Search">
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </button>
            </div>
          </form>

          {/* Search Results Display */}
          {hasSearched && (
            <div className="results-container">
              {/* Filter controls */}
              {!isSearching && (
                <div className="filter-controls-card">
                  <div className="filter-row">
                    <span className="filter-label">Library:</span>
                    <div className="chips-group">
                      {librariesList.map(lib => (
                        <button
                          key={lib}
                          className={`filter-chip ${selectedLibrary === lib ? 'active' : ''}`}
                          onClick={() => setSelectedLibrary(lib)}
                        >
                          {lib}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="filter-row">
                    <span className="filter-label">Style:</span>
                    <div className="chips-group">
                      {stylesList.map(stl => (
                        <button
                          key={stl}
                          className={`filter-chip ${selectedStyle === stl ? 'active' : ''}`}
                          onClick={() => setSelectedStyle(stl)}
                        >
                          {stl}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="filter-row-loved">
                    <button
                      className={`loved-toggle-btn ${showOnlyFavorites ? 'active' : ''}`}
                      onClick={() => setShowOnlyFavorites(!showOnlyFavorites)}
                    >
                      <svg viewBox="0 0 24 24" fill={showOnlyFavorites ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" width="16" height="16">
                        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
                      </svg>
                      Loved Icons ({favorites.length})
                    </button>
                  </div>
                </div>
              )}

              {/* Cross-Platform Premium Hub */}
              {!isSearching && activeSearch && (
                <div className="premium-hub-card">
                  <h3 className="premium-hub-title">
                    <span className="premium-glow-text">Cross-Platform Premium Hub</span>
                    <span className="premium-subtitle">Search and download animations, vectors, and PNG sets directly from official sites</span>
                  </h3>
                  <div className="premium-hub-grid">
                    {EXTERNAL_LIBRARIES.map((lib) => {
                      const matchingIcon = searchResults.find(icon => icon.library === lib.name);
                      const graphicSvg = matchingIcon ? matchingIcon.svg : lib.logo;
                      return (
                        <a
                          key={lib.id}
                          href={lib.url(activeSearch)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="premium-hub-item"
                          style={{ '--brand-color': lib.color } as React.CSSProperties}
                          title={`Search and download '${activeSearch}' on ${lib.name}`}
                        >
                          <div className="premium-hub-icon-wrapper" dangerouslySetInnerHTML={{ __html: formatPremiumSvg(graphicSvg) }}></div>
                          <div className="premium-hub-info">
                            <span className="premium-hub-name">{lib.name}</span>
                            <span className="premium-hub-desc">{lib.description}</span>
                            <span className="premium-hub-cta">Go to {lib.name} ↗</span>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

              <h2 className="results-title">
                {isSearching ? (
                  <span className="searching-spinner-text">Searching icons...</span>
                ) : ['Icons8', 'LottieFiles', 'Flaticon', 'SVGRepo', 'FontAwesome'].includes(selectedLibrary) ? (
                  <>
                    Explore premium assets on <span className="query-highlight">{selectedLibrary}</span> for <span className="query-highlight">"{activeSearch}"</span>
                  </>
                ) : (
                  <>
                    Found {filteredResults.length} matching icons for <span className="query-highlight">"{activeSearch}"</span>
                    {(selectedLibrary !== 'All' || selectedStyle !== 'All' || showOnlyFavorites) && (
                      <span className="filter-indicator"> (filtered)</span>
                    )}
                  </>
                )}
              </h2>

              {!isSearching && filteredResults.length === 0 && !['Icons8', 'LottieFiles', 'Flaticon', 'SVGRepo', 'FontAwesome'].includes(selectedLibrary) && (
                <div className="empty-results">
                  <p>No matching icons found for the selected filters. Try changing your filters or search terms.</p>
                </div>
              )}

              {/* Large Focused card for selected external library */}
              {!isSearching && ['Icons8', 'LottieFiles', 'Flaticon', 'SVGRepo', 'FontAwesome'].includes(selectedLibrary) && (
                <div className="external-focused-container">
                  {(() => {
                    const lib = EXTERNAL_LIBRARIES.find(l => l.name === selectedLibrary);
                    if (!lib) return null;
                    return (
                      <div className="external-focused-card" style={{ '--brand-color': lib.color } as React.CSSProperties}>
                        <div className="external-logo-large" dangerouslySetInnerHTML={{ __html: lib.logo }}></div>
                        <h3 className="external-focused-title">Search "{activeSearch}" on {lib.name}</h3>
                        <p className="external-focused-desc">{lib.description}</p>
                        <div className="external-focused-badges">
                          <span className="external-badge-pill">{lib.category}</span>
                          <span className="external-badge-pill">Direct Download</span>
                          <span className="external-badge-pill">Official Page</span>
                        </div>
                        <a
                          href={lib.url(activeSearch)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="external-focused-btn"
                        >
                          Launch {lib.name} Search & Download ↗
                        </a>
                      </div>
                    );
                  })()}
                </div>
              )}

                <div className="icons-grid">
                  {filteredResults.map((icon) => (
                    <div
                      key={icon.id}
                      id={`icon-card-${icon.id}`}
                      className="icon-card"
                      onClick={() => handleCopySVG(icon.svg, icon.id)}
                      title="Click to copy SVG"
                    >
                      {/* Loved Heart button */}
                      <button
                        className={`card-favorite-btn ${favorites.includes(icon.id) ? 'is-favorited' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(icon.id);
                        }}
                        title={favorites.includes(icon.id) ? "Remove from Loved" : "Love this Icon"}
                      >
                        <svg viewBox="0 0 24 24" fill={favorites.includes(icon.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
                        </svg>
                      </button>

                      <div className="icon-wrapper" dangerouslySetInnerHTML={{ __html: icon.svg }}></div>
                      <span className="icon-name">{icon.name}</span>
                      
                      <div className="icon-badges">
                        <span className="icon-badge library">{icon.library}</span>
                        <span className="icon-badge style">{icon.style}</span>
                      </div>

                      <a
                        href={icon.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="download-safe-link"
                        onClick={(e) => e.stopPropagation()}
                        title="Download safely from official site"
                      >
                        Download Safely ↗
                      </a>

                      <div className="copy-overlay">
                        <span>Copy SVG Code</span>
                      </div>
                    </div>
                  ))}

                  {/* Append quick external link cards when selectedLibrary is 'All' */}
                  {selectedLibrary === 'All' && !isSearching && EXTERNAL_LIBRARIES.map((lib) => {
                    const matchingIcon = searchResults.find(icon => icon.library === lib.name);
                    const graphicSvg = matchingIcon ? matchingIcon.svg : lib.logo;
                    return (
                      <a
                        key={`grid-ext-${lib.id}`}
                        href={lib.url(activeSearch)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="icon-card external-integration-card"
                        style={{ '--brand-color': lib.color } as React.CSSProperties}
                        onClick={(e) => e.stopPropagation()}
                        title={`Search and download '${activeSearch}' on ${lib.name}`}
                      >
                        <div className="icon-wrapper" dangerouslySetInnerHTML={{ __html: formatPremiumSvg(graphicSvg) }}></div>
                        <span className="icon-name">Search {lib.name}</span>
                        <div className="icon-badges">
                          <span className="icon-badge library">{lib.name}</span>
                          <span className="icon-badge style">Premium ↗</span>
                        </div>
                        <span className="download-safe-link ext-link">
                          Go to {lib.name} ↗
                        </span>
                      </a>
                    );
                  })}
                </div>
            </div>
          )}
        </div>
      </div>

      {/* Authentication Glassmorphic Modal */}
      {showAuthModal && (
        <div className="modal-overlay" onClick={() => setShowAuthModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setShowAuthModal(false)}>✕</button>

            <div className="modal-header">
              <h3 className="modal-title">Unlock Zenco Search</h3>
              <p className="modal-subtitle">Sign in to search, preview, and download premium SVG icons.</p>
            </div>

            {/* Error / Success Banners */}
            {otpError && <div className="modal-error-banner">{otpError}</div>}
            {otpSuccessMsg && <div className="modal-success-banner">{otpSuccessMsg}</div>}

            {authStep === 'email' && (
              <div className="auth-step-container">
                {/* Google Authentication (One-click login button) */}
                <div className="google-auth-section">
                  {/* Container for real Google Sign in Button */}
                  {useGsiButton && (
                    <div id="google-gsi-btn-container" className="google-btn-wrapper"></div>
                  )}

                  {/* Beautiful custom fallback button for sandbox mode */}
                  {!useGsiButton && (
                    <button className="custom-google-btn" onClick={() => handleGoogleLogin()}>
                      <svg className="google-icon" viewBox="0 0 24 24" width="18" height="18">
                        <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.92h6.69c-.29 1.5-1.14 2.78-2.4 3.62v3.02h3.87c2.26-2.08 3.58-5.14 3.58-8.49z" />
                        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.87-3.02c-1.08.72-2.45 1.16-4.06 1.16-3.11 0-5.74-2.11-6.68-4.96H1.21v3.11C3.18 21.88 7.39 24 12 24z" />
                        <path fill="#FBBC05" d="M5.32 14.27a7.16 7.16 0 0 1 0-4.54V6.62H1.21a11.94 11.94 0 0 0 0 10.76l4.11-3.11z" />
                        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.39 0 3.18 2.12 1.21 5.62l4.11 3.11c.94-2.85 3.57-4.98 6.68-4.98z" />
                      </svg>
                      Continue with Google
                    </button>
                  )}
                </div>

                <div className="auth-separator">
                  <span className="separator-line"></span>
                  <span className="separator-text">or use email</span>
                  <span className="separator-line"></span>
                </div>

                {/* Email Entry Form */}
                <form onSubmit={handleSendOTP} className="email-auth-form">
                  <div className="input-group">
                    <label className="input-label">Email Address</label>
                    <input
                      type="email"
                      className="modal-input"
                      placeholder="e.g. sayan@example.com"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      required
                    />
                  </div>

                  {captchaSvg && (
                    <div className="captcha-group">
                      <label className="input-label">Prove you are human</label>
                      <div className="captcha-container">
                        <div className="captcha-image" dangerouslySetInnerHTML={{ __html: captchaSvg }} />
                        <button type="button" className="captcha-refresh-btn" onClick={fetchAuthCaptcha} title="Refresh Captcha">
                          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
                        </button>
                        <input
                          type="text"
                          className="modal-input captcha-input"
                          placeholder="Answer"
                          value={captchaAnswer}
                          onChange={(e) => setCaptchaAnswer(e.target.value)}
                          required
                          autoComplete="off"
                        />
                      </div>
                    </div>
                  )}

                  <button type="submit" className="modal-submit-btn">
                    Send Verification Code
                  </button>
                </form>
              </div>
            )}

            {authStep === 'otp' && (
              <div className="auth-step-container">
                {/* OTP Verification Form */}
                <form onSubmit={handleVerifyOTP} className="otp-verification-form">
                  <p className="otp-instructions">
                    We sent a 6-digit code to <strong className="user-email-highlight">{emailInput}</strong>. Enter it below to continue.
                  </p>

                  <div className="otp-digits-wrapper">
                    {otpInput.map((digit, idx) => (
                      <input
                        key={idx}
                        type="text"
                        maxLength={1}
                        className="otp-digit-input"
                        value={digit}
                        ref={(el) => { otpRefs.current[idx] = el; }}
                        onChange={(e) => handleOtpBoxChange(e.target.value, idx)}
                        onKeyDown={(e) => handleOtpBoxKeyDown(e, idx)}
                        autoComplete="off"
                        pattern="[0-9]*"
                        inputMode="numeric"
                      />
                    ))}
                  </div>

                  <button type="submit" className="modal-submit-btn">
                    Verify & Continue Search
                  </button>

                  <div className="otp-resend-section">
                    {resendTimer > 0 ? (
                      <p className="resend-countdown">Resend code in {resendTimer}s</p>
                    ) : (
                      <button type="button" className="resend-btn" onClick={handleSendOTP}>
                        Resend Code
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    className="modal-back-btn"
                    onClick={() => {
                      setAuthStep('email')
                      setOtpError('')
                      setOtpSuccessMsg('')
                    }}
                  >
                    ← Back to Email entry
                  </button>
                </form>
              </div>
            )}

            {authStep === 'google-captcha' && (
              <div className="auth-step-container">
                {/* Google Captcha verification form */}
                <form onSubmit={handleGoogleCaptchaSubmit} className="email-auth-form">
                  <p className="otp-instructions" style={{ marginBottom: '20px', textAlign: 'center' }}>
                    Verify you are human to complete your Google Sign-In.
                  </p>

                  {captchaSvg && (
                    <div className="captcha-group">
                      <label className="input-label">Prove you are human</label>
                      <div className="captcha-container">
                        <div className="captcha-image" dangerouslySetInnerHTML={{ __html: captchaSvg }} />
                        <button type="button" className="captcha-refresh-btn" onClick={fetchAuthCaptcha} title="Refresh Captcha">
                          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
                        </button>
                        <input
                          type="text"
                          className="modal-input captcha-input"
                          placeholder="Answer"
                          value={captchaAnswer}
                          onChange={(e) => setCaptchaAnswer(e.target.value)}
                          required
                          autoComplete="off"
                        />
                      </div>
                    </div>
                  )}

                  <button type="submit" className="modal-submit-btn">
                    Verify & Sign In
                  </button>

                  <button
                    type="button"
                    className="modal-back-btn"
                    onClick={() => {
                      setAuthStep('email')
                      setOtpError('')
                      setOtpSuccessMsg('')
                      setTempGoogleCredential('')
                    }}
                  >
                    ← Back to Sign In options
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Search Captcha Glassmorphic Modal */}
      {showSearchCaptchaModal && (
        <div className="modal-overlay" onClick={() => setShowSearchCaptchaModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setShowSearchCaptchaModal(false)}>✕</button>

            <div className="modal-header">
              <h3 className="modal-title">Human Verification</h3>
              <p className="modal-subtitle">Solve this math puzzle to authorize your search session.</p>
            </div>

            {searchCaptchaError && <div className="modal-error-banner">{searchCaptchaError}</div>}

            <form onSubmit={handleVerifySearchCaptcha} className="email-auth-form">
              <div className="captcha-group search-captcha">
                <div className="captcha-container horizontal">
                  <div className="captcha-image large" dangerouslySetInnerHTML={{ __html: searchCaptchaSvg }} />
                  <button type="button" className="captcha-refresh-btn" onClick={fetchSearchCaptcha} title="Refresh Captcha">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
                  </button>
                </div>
                <div className="input-group">
                  <label className="input-label">Answer the mathematical puzzle above</label>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="Enter mathematical answer"
                    value={searchCaptchaAnswer}
                    onChange={(e) => setSearchCaptchaAnswer(e.target.value)}
                    required
                    autoComplete="off"
                  />
                </div>
              </div>
              <button type="submit" className="modal-submit-btn">
                Verify & Continue Search
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export default App
