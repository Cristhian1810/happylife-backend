import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

const authRequired = (req, res, next) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ message: "No autenticado." });
    }
    if (req.session.rolId !== 3) {
        return res.status(403).json({ message: "Acceso no autorizado para este rol." });
    }
    next();
};

router.get('/horario', authRequired, async (req, res) => {
    const doctorId = req.session.userId;
    try {
        const { rows } = await pool.query(
            "SELECT dia_semana, hora_inicio, hora_fin, duracion_cita_minutos FROM horarios_doctores WHERE doctor_usuario_id = $1 ORDER BY dia_semana ASC",
            [doctorId]
        );
        res.json(rows);
    } catch (error) {
        console.error("Error al obtener el horario:", error);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

router.post('/horario', authRequired, async (req, res) => {
    const doctorId = req.session.userId;
    const horarios = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query("DELETE FROM horarios_doctores WHERE doctor_usuario_id = $1", [doctorId]);

        const query = `
            INSERT INTO horarios_doctores (doctor_usuario_id, dia_semana, hora_inicio, hora_fin, duracion_cita_minutos)
            VALUES ($1, $2, $3, $4, $5)
        `;
        for (const dia of horarios) {
            await client.query(query, [doctorId, dia.dia_semana, dia.hora_inicio, dia.hora_fin, dia.duracion_cita_minutos]);
        }

        await client.query('COMMIT');
        res.status(200).json({ message: "Horario guardado correctamente." });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error al guardar el horario:", error);
        res.status(500).json({ message: "Error interno del servidor al guardar el horario." });
    } finally {
        client.release();
    }
});

router.get('/horario/excepciones', authRequired, async (req, res) => {
    const doctorId = req.session.userId;
    try {
        const { rows } = await pool.query(
            "SELECT id, fecha_excepcion, esta_disponible, hora_inicio, hora_fin FROM excepciones_horarios WHERE doctor_usuario_id = $1 ORDER BY fecha_excepcion DESC",
            [doctorId]
        );
        res.json(rows);
    } catch (error) {
        console.error("Error al obtener excepciones:", error);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

router.post('/horario/excepciones', authRequired, async (req, res) => {
    const doctorId = req.session.userId;
    const { fecha_excepcion, esta_disponible, hora_inicio, hora_fin } = req.body;

    if (!fecha_excepcion) {
        return res.status(400).json({ message: "La fecha es obligatoria." });
    }

    try {
        const query = `
            INSERT INTO excepciones_horarios (doctor_usuario_id, fecha_excepcion, esta_disponible, hora_inicio, hora_fin)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *;
        `;
        const params = [doctorId, fecha_excepcion, esta_disponible, esta_disponible ? hora_inicio : null, esta_disponible ? hora_fin : null];
        const { rows } = await pool.query(query, params);
        
        res.status(201).json({ message: "Excepción añadida correctamente.", excepcion: rows[0] });

    } catch (error) {
        console.error("Error al añadir excepción:", error);
        if (error.code === '23505') { // Código de error para violación de unicidad
            return res.status(409).json({ message: "Ya existe una excepción para esta fecha." });
        }
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

router.delete('/horario/excepciones/:id', authRequired, async (req, res) => {
    const doctorId = req.session.userId;
    const { id } = req.params;
    try {
        const { rowCount } = await pool.query(
            "DELETE FROM excepciones_horarios WHERE id = $1 AND doctor_usuario_id = $2",
            [id, doctorId]
        );
        if (rowCount === 0) {
            return res.status(404).json({ message: "Excepción no encontrada o no pertenece a este doctor." });
        }
        res.status(200).json({ message: "Excepción eliminada correctamente." });
    } catch (error) {
        console.error("Error al eliminar excepción:", error);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

export default router;