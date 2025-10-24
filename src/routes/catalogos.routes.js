import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

router.get('/generos', async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM generos');
    res.json(rows);
});

export default router;