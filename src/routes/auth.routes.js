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
        req.session.userId = usuario.id; 
        req.session.rolId = usuario.rol_id;

        req.session.save(err => {
            if (err) {
                console.error("Error al guardar la sesión:", err);
                return res.status(500).json({ mensaje: "Error al iniciar sesión." });
            }
            const { password_hash, ...userResponse } = usuario;
            return res.status(200).json({ 
                mensaje: "Inicio de sesión exitoso.",
                user: userResponse 
            });
        });

    } else {
        return res.status(401).json({ mensaje: "Correo o contraseña incorrectos." });
    }
});

router.get('/perfil', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'No estás autenticado.' });
    }

    try {
        const { rows } = await pool.query(
            'SELECT id, email, dni, nombres, apellidos, telefono, fecha_nacimiento, direccion, genero_id, rol_id FROM usuarios WHERE id = $1',
            [req.session.userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }
        
        res.json(rows[0]);

    } catch (error) {
        console.error("Error al obtener perfil:", error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

router.delete('/perfil/eliminar', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'No estás autenticado.' });
    }

    const { password_actual } = req.body;
    const usuarioId = req.session.userId;

    if (!password_actual) {
        return res.status(400).json({ message: 'La contraseña es requerida para eliminar la cuenta.' });
    }

    try {
        const userResult = await pool.query('SELECT password_hash FROM usuarios WHERE id = $1', [usuarioId]);
        
        if (userResult.rowCount === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }
        
        const storedHash = userResult.rows[0].password_hash;
        const isMatch = await bcrypt.compare(password_actual, storedHash);

        if (!isMatch) {
            return res.status(400).json({ message: 'La contraseña es incorrecta.' });
        }

        const updateQuery = 'UPDATE usuarios SET esta_activo = false WHERE id = $1';
        const { rowCount } = await pool.query(updateQuery, [usuarioId]);

        if (rowCount === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado para desactivar.' });
        }

        req.session.destroy(err => {
            if (err) {
                console.error('Error al destruir la sesión después de desactivar la cuenta:', err);
                return res.status(200).json({ message: 'Cuenta desactivada, pero hubo un error al cerrar la sesión.' });
            }
            res.clearCookie('connect.sid');
            return res.status(200).json({ message: 'Tu cuenta ha sido eliminada correctamente.' });
        });

    } catch (error) {
        console.error('Error al desactivar la cuenta:', error);
        res.status(500).json({ message: 'Error interno del servidor al intentar eliminar la cuenta.' });
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
            'SELECT * FROM usuarios WHERE email = $1 AND esta_activo = true', 
            [email]
        );

        if (rows.length === 0) return false;

        const user = rows[0];
        const esPasswordCorrecto = await bcrypt.compare(passwordFormulario, user.password_hash);
        
        return esPasswordCorrecto ? user : false;

    } catch (error) {
        console.error("Error al verificar credenciales:", error);
        return false;
    }
}

export default router;