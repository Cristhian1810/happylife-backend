import { Router } from "express";
import { pool } from "../db.js";
import bcrypt from 'bcryptjs';

const router = Router();

router.get('/administradores', async (req, res) => {
    const { rows } = await pool.query('SELECT id, email, dni, nombres, apellidos, telefono, esta_activo FROM usuarios WHERE rol_id = 2 ORDER BY nombres ASC');
    res.json(rows);
});

router.get('/administradores/:id', async (req, res) => {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT id, email, dni, nombres, apellidos, telefono, esta_activo FROM usuarios WHERE id = $1 AND rol_id = 2', [id]);
    
    if (rows.length === 0) {
        return res.status(404).json({ message: 'Administrador no encontrado.' });
    }
    res.json(rows[0]);
});

router.post('/administradores', async (req, res) => {
    try {
        const { nombres, apellidos, dni, email, password, telefono } = req.body;
        const existingUser = await pool.query('SELECT * FROM usuarios WHERE email = $1 OR dni = $2', [email, dni]);
        if (existingUser.rowCount > 0) {
            if (existingUser.rows[0].email === email) return res.status(409).json({ message: 'El correo electrónico ya está registrado.' });
            if (existingUser.rows[0].dni === dni) return res.status(409).json({ message: 'El DNI ya está registrado.' });
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const { rows } = await pool.query('INSERT INTO usuarios (email, password_hash, dni, nombres, apellidos, telefono, rol_id) VALUES ($1, $2, $3, $4, $5, $6, 2) RETURNING id', [email, hashedPassword, dni, nombres, apellidos, telefono]);
        const usuarioId = rows[0].id;
        res.status(201).json({ message: "Administrador registrado correctamente", usuarioId });
    } catch (error) {
        console.error('Error en el registro de administrador:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

router.put('/administradores/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombres, apellidos, dni, email, telefono, esta_activo } = req.body;

        const existingUser = await pool.query(
            `SELECT id, email, dni FROM usuarios WHERE (email = $1 OR dni = $2) AND id != $3`,
            [email, dni, id]
        );

        if (existingUser.rowCount > 0) {
            if (existingUser.rows[0].email === email) {
                return res.status(409).json({ 
                    message: 'El correo electrónico ya está en uso por otro usuario.' 
                });
            }
            if (existingUser.rows[0].dni === dni) {
                return res.status(409).json({ 
                    message: 'El DNI ya está registrado por otro usuario.' 
                });
            }
        }

        const { rows } = await pool.query(
            `UPDATE usuarios 
             SET nombres = $1, apellidos = $2, dni = $3, email = $4, telefono = $5, esta_activo = $6
             WHERE id = $7 AND rol_id = 2
             RETURNING id, nombres, apellidos, dni, email, telefono, esta_activo`,
            [nombres, apellidos, dni, email, telefono, esta_activo, id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Administrador no encontrado.' });
        }

        res.json({ message: 'Administrador actualizado correctamente', admin: rows[0] });

    } catch (error) {
        console.error('Error al actualizar administrador:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

router.delete('/administradores/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { rowCount } = await pool.query(
            'UPDATE usuarios SET esta_activo = false WHERE id = $1 AND rol_id = 2',
            [id]
        );

        if (rowCount === 0) {
            return res.status(404).json({ message: 'Administrador no encontrado.' });
        }

        res.status(200).json({ message: 'Administrador desactivado correctamente.' });

    } catch (error) {
        console.error('Error al desactivar administrador:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});


export default router;