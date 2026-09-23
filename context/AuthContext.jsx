import { createContext, useContext, useState } from 'react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  // Bạn có thể thay đổi 'role' ở đây thành 'ADMIN', 'MANAGER', 'OPERATOR', hoặc 'USER' để test
  const [user, setUser] = useState({
    id: 1,
    name: 'Nguyễn Văn A',
    role: 'ADMIN', 
  });

  const login = (userData) => setUser(userData);
  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);