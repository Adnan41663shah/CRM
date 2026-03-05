import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import LoadingSpinner from '@/components/LoadingSpinner';
import { safeToast } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

const Login: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');
  const { login } = useAuth();

  useEffect(() => {
    if (error) {
      safeToast.error(decodeURIComponent(error));
      navigate('/login', { replace: true });
    }
  }, [error, navigate]);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      safeToast.error('Please enter both email and password');
      return;
    }
    try {
      setIsLoading(true);
      await login({ email, password });
      navigate('/dashboard');
    } catch (error: any) {
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex relative overflow-hidden bg-slate-900 dark:bg-slate-950">
      <div className="absolute inset-0 z-1 bg-primary-900/30 backdrop-blur-[2px]" />
      <div className="absolute inset-0 z-1 bg-slate-900/40 dark:bg-slate-950/40" />

      <div className="relative z-10 w-full min-h-screen flex flex-col md:flex-row bg-white dark:bg-slate-900 overflow-hidden border-0 rounded-none shadow-2xl">

        {/* Left panel – branding */}
        <div className="relative hidden md:flex md:w-[54%] bg-gradient-to-br from-primary-500 via-primary-600 to-primary-800 dark:from-primary-600 dark:via-primary-700 dark:to-primary-900 p-6 md:p-8 lg:p-14 flex-col justify-center overflow-hidden">
          <div className="relative z-10 text-center">
            <h2 className="text-white text-2xl lg:text-4xl xl:text-5xl font-bold mb-4 tracking-tight">
              Customer Relationship Management
            </h2>
            <p className="text-primary-100 text-sm lg:text-base max-w-md mx-auto font-medium">
              Manage inquiries, follow-ups, and conversions in one place.
            </p>
          </div>
        </div>

        {/* Right panel – login form */}
        <div className="w-full md:w-[46%] bg-white dark:bg-slate-900 px-6 py-7 sm:px-9 sm:py-8 lg:px-11 lg:py-9 flex flex-col justify-center overflow-y-auto">
          <div className="w-full max-w-[330px] sm:max-w-[360px] mx-auto">

            {/* Brand */}
            <div className="flex justify-start mb-4 sm:mb-5">
              <span className="text-xl sm:text-2xl font-bold text-primary-600 dark:text-primary-400">CRM</span>
            </div>

            {/* Heading */}
            <h1 className="text-lg sm:text-xl font-bold text-secondary-900 dark:text-white mb-1 tracking-tight">
              Login
            </h1>
            <p className="text-secondary-500 dark:text-slate-400 text-sm font-medium mb-4 sm:mb-5">
              Welcome back! Please enter your details.
            </p>

            {/* Login form */}
            <form onSubmit={handlePasswordLogin} className="space-y-3.5">
                  <div>
                    <label htmlFor="email" className="block text-xs sm:text-sm font-semibold text-secondary-700 dark:text-slate-300 mb-1.5">
                      Email address
                    </label>
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 sm:py-3 rounded-xl border border-secondary-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 transition-all bg-secondary-50/60 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-800 text-secondary-900 dark:text-white placeholder-secondary-400 dark:placeholder-slate-500 text-sm font-medium"
                      placeholder="Enter your email"
                      disabled={isLoading}
                    />
                  </div>
                  <div>
                    <label htmlFor="password" className="block text-xs sm:text-sm font-semibold text-secondary-700 dark:text-slate-300 mb-1.5">
                      Password
                    </label>
                    <input
                      type="password"
                      id="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 sm:py-3 rounded-xl border border-secondary-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 transition-all bg-secondary-50/60 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-800 text-secondary-900 dark:text-white placeholder-secondary-400 dark:placeholder-slate-500 text-sm font-medium"
                      placeholder="Enter your password"
                      disabled={isLoading}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 px-4 bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold rounded-xl transition-all shadow-md shadow-primary-500/25 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed hover:-translate-y-0.5 active:translate-y-0"
                  >
                    {isLoading ? (
                      <>
                        <LoadingSpinner size="sm" />
                        <span className="ml-2">Signing in...</span>
                      </>
                    ) : (
                      <span className="flex items-center gap-2">
                        Login
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </span>
                    )}
                  </button>
                </form>

            <p className="mt-4 text-center text-sm text-secondary-600 dark:text-slate-400">
              Don&apos;t have an account?{' '}
              <Link to="/register" className="font-semibold text-primary-600 hover:text-primary-700 hover:underline">
                Sign up
              </Link>
            </p>

            {/* Footer links */}
            <p className="text-[11px] sm:text-xs text-secondary-400 dark:text-slate-500 text-center font-medium leading-relaxed">
              By signing in, you accept our{' '}
              <Link to="#" className="text-primary-600 hover:text-primary-700 hover:underline transition-colors">Terms of use</Link>
              ,{' '}
              <Link to="#" className="text-primary-600 hover:text-primary-700 hover:underline transition-colors">Privacy policy</Link>
              {' '}and{' '}
              <Link to="#" className="text-primary-600 hover:text-primary-700 hover:underline transition-colors">Refund policy</Link>
            </p>

          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
