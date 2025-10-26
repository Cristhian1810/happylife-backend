import { Router } from "express";
import { pool } from "../db.js";
import bcrypt from "bcryptjs";

const router = Router();

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

router.put('/perfil/cambiar-password', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'No estás autenticado.' });
    }

    const { password_actual, nueva_password } = req.body;
    const usuarioId = req.session.userId;

    if (!password_actual || !nueva_password) {
        return res.status(400).json({ message: 'Todos los campos son requeridos.' });
    }

    try {
        const result = await pool.query('SELECT password_hash FROM usuarios WHERE id = $1', [usuarioId]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }
        const storedHash = result.rows[0].password_hash;

        const isMatch = await bcrypt.compare(password_actual, storedHash);
        if (!isMatch) {
            return res.status(400).json({ message: 'La contraseña actual es incorrecta.' });
        }

        const salt = await bcrypt.genSalt(10);
        const newHashedPassword = await bcrypt.hash(nueva_password, salt);

        await pool.query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [newHashedPassword, usuarioId]);

        res.status(200).json({ message: 'Contraseña actualizada correctamente.' });

    } catch (error) {
        console.error('Error al cambiar la contraseña:', error);
        res.status(500).json({ message: 'Error interno del servidor al cambiar la contraseña.' });
    }
});

export default router;