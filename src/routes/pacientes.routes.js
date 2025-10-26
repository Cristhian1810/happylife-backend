import { Router } from "express";
import { pool } from "../db.js";
import bcrypt from 'bcryptjs';

const router = Router();

router.get('/pacientes', async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE rol_id = 5 ORDER BY nombres ASC');
    res.json(rows);
});

router.get('/pacientes/:id', async (req, res) => {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE id = $1 AND esta_activo = true', [id]);
    res.json(rows[0]);
});

router.post('/pacientes', async (req, res) => {
    try {
        const { nombres, apellidos, dni, email, password, telefono, fechaNacimiento, genero } = req.body;

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
            'INSERT INTO usuarios (email, password_hash, dni, nombres, apellidos, telefono, fecha_nacimiento, genero_id, rol_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 5) RETURNING id', // Solo necesitamos retornar el id
            [email, hashedPassword, dni, nombres, apellidos, telefono, fechaNacimiento, genero]
        );
        const usuarioId = rows[0].id;

        await pool.query(
            `INSERT INTO perfiles_pacientes (usuario_id) VALUES ($1)`,
            [usuarioId]
        );

        res.status(201).json({ message: "Paciente registrado correctamente", usuarioId });

    } catch (error) {
        console.error('Error en el registro de paciente:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

export default router;