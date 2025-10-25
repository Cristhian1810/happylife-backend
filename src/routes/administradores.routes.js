import { Router } from "express";
import { pool } from "../db.js";
import bcrypt from 'bcryptjs';

const router = Router();

router.get('/administradores', async (req, res) => {
    const { rows } = await pool.query('SELECT id, email, dni, nombres, apellidos, telefono, esta_activo FROM usuarios WHERE esta_activo = true AND rol_id = 2');
    res.json(rows);
});

router.get('/administradores/:id', async (req, res) => {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT id, email, dni, nombres, apellidos, telefono, esta_activo FROM usuarios WHERE id = $1 AND esta_activo = true AND rol_id = 2', [id]);
    
    if (rows.length === 0) {
        return res.status(404).json({ message: 'Administrador no encontrado.' });
    }

    res.json(rows[0]);
});

router.post('/administradores', async (req, res) => {
    try {
        const { nombres, apellidos, dni, email, password, telefono } = req.body;

        const existingUser = await pool.query(
            'SELECT * FROM usuarios WHERE email = $1 OR dni = $2',
            [email, dni]
        );

        if (existingUser.rowCount > 0) {
            if (existingUser.rows[0].email === email) {
                return res.status(409).json({ message: 'El correo electrónico ya está registrado.' });
            }
            if (existingUser.rows[0].dni === dni) {
                return res.status(409).json({ message: 'El DNI ya está registrado.' });
            }
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const { rows } = await pool.query(
            'INSERT INTO usuarios (email, password_hash, dni, nombres, apellidos, telefono, rol_id) VALUES ($1, $2, $3, $4, $5, $6, 2) RETURNING id',
            [email, hashedPassword, dni, nombres, apellidos, telefono]
        );
        
        const usuarioId = rows[0].id;

        res.status(201).json({ message: "Administrador registrado correctamente", usuarioId });

    } catch (error) {
        console.error('Error en el registro de administrador:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

export default router;