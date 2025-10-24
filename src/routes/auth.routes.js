import { Router } from "express";
import { pool } from "../db.js";
import bcrypt from "bcryptjs";

const router = Router();

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ mensaje: "Faltan datos" });
    }

    const usuario = await verificarCredenciales(email, password);
    
    if (usuario) {
        req.session.user = {
            id: usuario.id,
            rol: usuario.rol_id,
            nombres: usuario.nombres,
            apellidos: usuario.apellidos
        };

        return res.status(200).json({ mensaje: "Inicio de sesión exitoso." });
    }

    return res.status(401).json({ mensaje: "Correo o contraseña incorrectos." });
});

router.get('/perfil', (req, res) => {
    if (req.session.user) {
        res.json(req.session.user);
    } else {
        res.status(401).json({ message: 'No estás autenticado.' });
    }
});

router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ message: 'No se pudo cerrar la sesión.' });
        }
        res.clearCookie('connect.sid');
        return res.status(200).json({ message: 'Sesión cerrada correctamente.' });
    });
});

async function verificarCredenciales(email, passwordFormulario) {
    try {
        const { rows } = await pool.query(
            'SELECT id, rol_id, nombres, apellidos, password_hash FROM usuarios WHERE email = $1 AND esta_activo = true', 
            [email]
        );

        if (rows.length === 0) {
            return false;
        }

        const user = rows[0];
        
        const esPasswordCorrecto = await bcrypt.compare(passwordFormulario, user.password_hash);

        return esPasswordCorrecto ? user : false;

    } catch (error) {
        console.error("Error al verificar credenciales:", error);
        return false;
    }
}

export default router;