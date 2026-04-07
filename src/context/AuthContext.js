import { createContext, useContext, useMemo, useState } from 'react';

const USERS_KEY = 'ph_users';
const SESSION_KEY = 'ph_session';

const DEMO_USERS = [
  {
    id: 'anitha.demo@healthbot.test',
    name: 'Anitha Kumar',
    email: 'anitha.demo@healthbot.test',
    password: 'Demo@123',
  },
  {
    id: 'rahul.demo@healthbot.test',
    name: 'Rahul Sharma',
    email: 'rahul.demo@healthbot.test',
    password: 'Demo@123',
  },
  {
    id: 'meena.demo@healthbot.test',
    name: 'Meena Selvam',
    email: 'meena.demo@healthbot.test',
    password: 'Demo@123',
  },
  {
    id: 'arjun.demo@healthbot.test',
    name: 'Arjun Patel',
    email: 'arjun.demo@healthbot.test',
    password: 'Demo@123',
  },
];

const AuthContext = createContext(null);

function readUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) {
      writeUsers(DEMO_USERS);
      return DEMO_USERS;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      writeUsers(DEMO_USERS);
      return DEMO_USERS;
    }

    return parsed;
  } catch (error) {
    writeUsers(DEMO_USERS);
    return DEMO_USERS;
  }
}

function writeUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readSession);

  const register = ({ name, email, password }) => {
    const normalizedEmail = email.trim().toLowerCase();
    const users = readUsers();
    const exists = users.some((existingUser) => existingUser.email === normalizedEmail);

    if (exists) {
      throw new Error('An account with this email already exists.');
    }

    const newUser = {
      id: normalizedEmail,
      name: name.trim(),
      email: normalizedEmail,
      password,
    };

    writeUsers([...users, newUser]);

    const sessionUser = { id: newUser.id, name: newUser.name, email: newUser.email };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
    setUser(sessionUser);
  };

  const login = ({ email, password }) => {
    const normalizedEmail = email.trim().toLowerCase();
    const users = readUsers();
    const match = users.find(
      (existingUser) => existingUser.email === normalizedEmail && existingUser.password === password
    );

    if (!match) {
      throw new Error('Invalid email or password.');
    }

    const sessionUser = { id: match.id, name: match.name, email: match.email };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
    setUser(sessionUser);
  };

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  const value = useMemo(
    () => ({
      user,
      register,
      login,
      logout,
      isAuthenticated: Boolean(user),
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return context;
}