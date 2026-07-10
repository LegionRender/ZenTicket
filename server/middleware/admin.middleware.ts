// Middleware para validar rol de administrador
export const requireAdmin = async (req: any, res: any, next: any) => {
  if (!req.user) {
    res.status(401).json({ error: "Usuario no autenticado." });
    return;
  }
  const email = (req.user.email || "").toLowerCase();
  const isAdmin = email === "ricardo@zenticket.mx" || 
                  email === "legionrender@gmail.com" || 
                  req.user.role === "admin" || 
                  (req.user.claims && req.user.claims.admin === true);
  
  if (!isAdmin) {
    res.status(403).json({ error: "Acceso denegado. Se requiere rol de administrador." });
    return;
  }
  next();
};
