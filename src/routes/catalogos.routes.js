import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

router.get('/generos', async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM generos');
    res.json(rows);
});

router.get('/tipo-sangre', async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM tipo_sangre');
    res.json(rows);
});

router.get('/especialidades', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT id, nombre FROM especialidades ORDER BY nombre ASC');
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener especialidades:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

router.get('/titulos-profesionales', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT id, nombre FROM titulos_profesionales ORDER BY nombre ASC');
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener títulos:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

export default router;