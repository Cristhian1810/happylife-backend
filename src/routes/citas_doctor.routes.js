import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

const isDoctor = (req, res, next) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ message: "No autenticado." });
    }
    if (req.session.rolId !== 3) {
        return res.status(403).json({ message: "Acceso no autorizado para este rol." });
    }
    next();
};

router.get('/citas-doctor', isDoctor, async (req, res) => {
    const doctorId = req.session.userId;
    try {
        const { rows } = await pool.query(`
            SELECT 
                c.id, 
                c.fecha_hora_inicio, 
                c.motivo_consulta, 
                u.nombres || ' ' || u.apellidos as paciente, 
                ec.nombre as estado,
                c.estado_cita_id
            FROM citas c
            JOIN usuarios u ON c.paciente_usuario_id = u.id
            JOIN estados_cita ec ON c.estado_cita_id = ec.id
            WHERE c.doctor_usuario_id = $1
            ORDER BY c.fecha_hora_inicio DESC
        `, [doctorId]);
        res.json(rows);
    } catch (error) {
        console.error("Error al obtener las citas del doctor:", error);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

router.put('/citas-doctor/:citaId/estado', isDoctor, async (req, res) => {
    const doctorId = req.session.userId;
    const { citaId } = req.params;
    const { estado_cita_id } = req.body;

    if (!estado_cita_id) {
        return res.status(400).json({ message: "El nuevo estado es requerido." });
    }

    try {
        const { rowCount } = await pool.query(
            "UPDATE citas SET estado_cita_id = $1 WHERE id = $2 AND doctor_usuario_id = $3",
            [estado_cita_id, citaId, doctorId]
        );

        if (rowCount === 0) {
            return res.status(404).json({ message: "La cita no se encontró o no pertenece a este doctor." });
        }
        res.status(200).json({ message: "Estado de la cita actualizado correctamente." });
    } catch (error) {
        console.error("Error al actualizar estado de la cita:", error);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

export default router;