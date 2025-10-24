import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

router.get('/administradores', async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE esta_activo = true and rol_id = 2');
    res.json(rows);
});

router.get('/administradores/:id', async (req, res) => {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE id = $1', [id]);
    res.json(rows[0]);
});

router.post('/administradores', async (req, res) => {
    const { nombres, apellidos, dni, email, password, rol } = req.body;
    const { rows } = await pool.query('INSERT INTO usuarios (email, password_hash, dni, nombres, apellidos, rol_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [email, password, dni, nombres, apellidos, rol]);
    res.json(rows[0]);
});

export default router;