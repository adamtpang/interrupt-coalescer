import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  onSnapshot,
  deleteDoc
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
console.log('Initializing Firebase with config:', {
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId
});

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Initialize Firestore with persistent cache
const db = initializeFirestore(app, {
  cache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

const DEFAULT_SETTINGS = {
  startTime: '06:00',
  endTime: '18:00'
};

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [error, setError] = useState(null);
  const [hasLicense, setHasLicense] = useState(false);

  // Load user data from Firestore
  const loadUserData = async (userId) => {
    try {
      console.log('Loading user data for:', userId);
      const userDoc = await getDoc(doc(db, 'users', userId));

      if (userDoc.exists()) {
        const userData = userDoc.data();
        console.log('User data loaded:', userData);
        setSettings(userData.settings || DEFAULT_SETTINGS);
        setHasLicense(!!userData.license?.active);
      } else {
        console.log('No existing data, saving defaults');
        await saveUserData({ settings: DEFAULT_SETTINGS });
        setSettings(DEFAULT_SETTINGS);
        setHasLicense(false);
      }
      setError(null);
    } catch (error) {
      console.error('Error loading user data:', error);
      setError('Failed to load user data. Please check your internet connection.');
    }
  };

  // Save user data to Firestore
  const saveUserData = async (data) => {
    if (!auth.currentUser) return;

    try {
      console.log('Saving user data:', data);
      await setDoc(doc(db, 'users', auth.currentUser.uid), {
        ...data,
        email: auth.currentUser.email,
        lastUpdated: new Date().toISOString()
      }, { merge: true });

      if (data.settings) setSettings(data.settings);
      setError(null);
      console.log('Data saved successfully');
    } catch (error) {
      console.error('Error saving data:', error);
      setError('Failed to save data. Please check your internet connection.');
      throw error;
    }
  };

  // Subscribe to license changes
  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (doc) => {
      if (doc.exists()) {
        const userData = doc.data();
        setHasLicense(!!userData.license?.active);
        console.log('License status updated:', !!userData.license?.active);
      }
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    console.log('Setting up auth state listener...');
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log('Auth state changed:', {
        isLoggedIn: !!user,
        email: user?.email,
        uid: user?.uid
      });

      setUser(user);

      if (user) {
        // Load user data when they sign in
        await loadUserData(user.uid);
      } else {
        // Reset state on logout
        setSettings(DEFAULT_SETTINGS);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async () => {
    setError(null);
    console.log('Starting Google sign-in process...');

    const provider = new GoogleAuthProvider();

    // Add all required scopes during initial login
    provider.addScope('https://www.googleapis.com/auth/calendar.events.freebusy');
    provider.addScope('https://www.googleapis.com/auth/calendar.events');

    // Store the access token in user metadata
    provider.setCustomParameters({
      access_type: 'offline',
      prompt: 'consent'
    });

    try {
      console.log('Opening Google sign-in popup...');
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);

      console.log('Sign-in successful:', {
        email: result.user.email,
        uid: result.user.uid,
        hasAccessToken: !!credential?.accessToken
      });

      if (!credential?.accessToken) {
        console.error('No access token received from Google sign-in');
        throw new Error('No access token received');
      }

      // Store the access token in Firestore
      const userData = {
        settings: DEFAULT_SETTINGS,
        googleAuth: {
          accessToken: credential.accessToken,
          lastUpdated: new Date().toISOString()
        },
        email: result.user.email.toLowerCase(),
        lastLogin: new Date().toISOString()
      };

      console.log('Saving user data to Firestore:', {
        uid: result.user.uid,
        hasAccessToken: !!userData.googleAuth.accessToken
      });

      await setDoc(doc(db, 'users', result.user.uid), userData, { merge: true });
      console.log('User data saved successfully');

      // Verify the token was saved
      const savedDoc = await getDoc(doc(db, 'users', result.user.uid));
      const savedData = savedDoc.data();
      console.log('Verified saved data:', {
        hasAccessToken: !!savedData?.googleAuth?.accessToken,
        lastUpdated: savedData?.googleAuth?.lastUpdated,
        hasLicense: !!savedData?.license?.active
      });

      // Load user settings
      setSettings(savedData.settings || DEFAULT_SETTINGS);

      return result;
    } catch (error) {
      console.error('Sign-in error:', error);
      setError('Failed to sign in. Please try again.');
      throw error;
    }
  };

  const logout = async () => {
    setError(null);
    console.log('Starting logout process...');
    try {
      await signOut(auth);
      // Reset state on logout
      setSettings(DEFAULT_SETTINGS);
      console.log('Logout successful');
    } catch (error) {
      console.error('Logout error:', error);
      setError('Failed to sign out. Please try again.');
      throw error;
    }
  };

  const redirectToCheckout = async () => {
    try {
      const response = await fetch('https://caldumpcom-production.up.railway.app/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: user.email,
          returnUrl: window.location.origin
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create checkout session');
      }

      const { url } = await response.json();
      if (!url) {
        throw new Error('No checkout URL received');
      }

      console.log('Redirecting to checkout:', url);
      window.location.href = url;
    } catch (error) {
      console.error('Error redirecting to checkout:', error);
      setError('Failed to start checkout process. Please try again.');
    }
  };

  const value = {
    user,
    login,
    logout,
    loading,
    settings,
    error,
    hasLicense,
    redirectToCheckout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export default AuthContext;