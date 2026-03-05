import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Auth callback placeholder - redirects to login.
 * Previously used for OAuth flows; now just redirects to login page.
 */
const AuthCallback: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/login', { replace: true });
  }, [navigate]);

  return null;
};

export default AuthCallback;
