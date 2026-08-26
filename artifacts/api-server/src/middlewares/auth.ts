import { Request, Response, NextFunction } from "express";

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.adminId) {
    res.status(401).json({ error: "Unauthorized", message: "Admin authentication required" });
    return;
  }
  next();
}
