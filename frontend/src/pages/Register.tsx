import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/utils/cn';
import LoadingSpinner from '@/components/LoadingSpinner';

interface RegisterFormData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: string;
}

const Register: React.FC = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>({
    defaultValues: {
      role: 'presales',
    },
  });

  const password = watch('password');

  const onSubmit = async (data: RegisterFormData) => {
    try {
      setIsLoading(true);
      const { confirmPassword, ...userData } = data;
      await registerUser(userData as any);
      // Delay navigation to ensure auth state is committed before ProtectedRoute checks it
      setTimeout(() => navigate('/dashboard', { replace: true }), 0);
    } catch (error) {
      console.error('Registration error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-secondary-50 dark:bg-slate-900 relative overflow-hidden">
      {/* Background dot pattern */}
      <div 
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `radial-gradient(circle, #c7d2fe 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }}
      />
      
      {/* Top accent border */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-primary-500" />

      {/* Header */}
      <header className="relative z-10 bg-white dark:bg-slate-900 px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-xl font-bold text-primary-600 dark:text-primary-400">CRM</span>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <Link
              to="/login"
              className="px-4 sm:px-5 py-2 sm:py-2.5 text-sm sm:text-base font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-primary-500 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
            >
              Login
            </Link>
            <Link
              to="/register"
              className="px-4 sm:px-5 py-2 sm:py-2.5 text-sm sm:text-base font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-600 transition-colors"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="relative z-10 flex items-center justify-center min-h-[calc(100vh-80px)] px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="w-full max-w-md">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 dark:text-white text-center mb-8 sm:mb-10">
            Sign Up
          </h1>

          {/* Form */}
          <form className="space-y-5 sm:space-y-6" onSubmit={handleSubmit(onSubmit)}>
            {/* Name */}
            <div>
              <label 
                htmlFor="name" 
                className="block text-sm sm:text-base font-medium text-gray-700 mb-2"
              >
                Full Name
              </label>
              <input
                {...register('name', {
                  required: 'Name is required',
                  minLength: {
                    value: 2,
                    message: 'Name must be at least 2 characters',
                  },
                })}
                type="text"
                autoComplete="name"
                className={cn(
                  'w-full px-4 py-3 sm:py-3.5 text-sm sm:text-base text-gray-900 dark:text-white bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all',
                  errors.name && 'border-red-300 focus:ring-red-500 focus:border-red-500'
                )}
                placeholder="Enter your full name"
              />
              {errors.name && (
                <p className="mt-1.5 text-sm text-red-600">
                  {errors.name.message}
                </p>
              )}
            </div>

            {/* Email */}
            <div>
              <label 
                htmlFor="email" 
                className="block text-sm sm:text-base font-medium text-gray-700 mb-2"
              >
                Email
              </label>
              <input
                {...register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
                    message: 'Please enter a valid email address',
                  },
                  validate: {
                    noSpaces: (value) => !/\s/.test(value) || 'Email cannot contain spaces',
                    validDomain: (value) => {
                      const domain = value.split('@')[1];
                      if (!domain) return 'Invalid email format';
                      if (domain.length < 3) return 'Invalid email domain';
                      if (!domain.includes('.')) return 'Invalid email domain';
                      return true;
                    },
                  },
                })}
                type="email"
                autoComplete="email"
                className={cn(
                  'w-full px-4 py-3 sm:py-3.5 text-sm sm:text-base text-gray-900 dark:text-white bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all',
                  errors.email && 'border-red-300 focus:ring-red-500 focus:border-red-500'
                )}
                placeholder="Enter your email"
              />
              {errors.email && (
                <p className="mt-1.5 text-sm text-red-600">
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Role */}
            <div>
              <label 
                htmlFor="role" 
                className="block text-sm sm:text-base font-medium text-gray-700 mb-2"
              >
                Role
              </label>
              <select
                {...register('role', { required: 'Role is required' })}
                id="role"
                className={cn(
                  'w-full px-4 py-3 sm:py-3.5 pr-10 text-sm sm:text-base text-gray-900 dark:text-white bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all',
                  errors.role && 'border-red-300 focus:ring-red-500 focus:border-red-500'
                )}
              >
                <option value="presales">Presales</option>
                <option value="sales">Sales</option>
              </select>
              {errors.role && (
                <p className="mt-1.5 text-sm text-red-600">
                  {errors.role.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label 
                htmlFor="password" 
                className="block text-sm sm:text-base font-medium text-gray-700 mb-2"
              >
                Password
              </label>
              <div className="relative">
                <input
                  {...register('password', {
                    required: 'Password is required',
                    minLength: {
                      value: 6,
                      message: 'Password must be at least 6 characters',
                    },
                  })}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={cn(
                    'w-full px-4 py-3 sm:py-3.5 pr-12 text-sm sm:text-base text-gray-900 dark:text-white bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all',
                    errors.password && 'border-red-300 focus:ring-red-500 focus:border-red-500'
                  )}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-gray-700"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 text-sm text-red-600">
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label 
                htmlFor="confirmPassword" 
                className="block text-sm sm:text-base font-medium text-gray-700 mb-2"
              >
                Confirm Password
              </label>
              <div className="relative">
                <input
                  {...register('confirmPassword', {
                    required: 'Please confirm your password',
                    validate: (value) =>
                      value === password || 'Passwords do not match',
                  })}
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={cn(
                    'w-full px-4 py-3 sm:py-3.5 pr-12 text-sm sm:text-base text-gray-900 dark:text-white bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all',
                    errors.confirmPassword && 'border-red-300 focus:ring-red-500 focus:border-red-500'
                  )}
                  placeholder="Confirm your password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-gray-700"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="mt-1.5 text-sm text-red-600">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

          {/* Submit button */}
          <div>
            <button
              type="submit"
              disabled={isLoading}
              className={cn(
                'w-full py-3 sm:py-3.5 text-sm sm:text-base font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-400',
                isLoading && 'opacity-50 cursor-not-allowed',
                !isLoading && 'hover:opacity-90'
              )}
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <LoadingSpinner size="sm" className="mr-2" />
                  Creating account...
                </div>
              ) : (
                'Sign Up'
              )}
            </button>
          </div>

          {/* Legal text */}
          <p className="text-xs sm:text-sm text-gray-600 text-center px-2">
            By SignUp, you accept our{' '}
            <Link to="#" className="text-blue-600 hover:text-blue-700 underline">
              Terms of use
            </Link>
            ,{' '}
            <Link to="#" className="text-blue-600 hover:text-blue-700 underline">
              Privacy policy
            </Link>
            {' '}and{' '}
            <Link to="#" className="text-blue-600 hover:text-blue-700 underline">
              Refund policy
            </Link>
          </p>

          {/* Sign in link */}
          <p className="text-sm sm:text-base text-center">
            Already have an account?{' '}
            <Link
              to="/login"
              className="text-blue-600 hover:text-blue-700 underline"
            >
              Sign in
            </Link>
          </p>
        </form>
        </div>
      </div>
    </div>
  );
};

export default Register;
