import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

const isDoctor = (req, res, next) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ message: "No autenticado." });
    }
    if (req.session.rolId !== 3) {
        return res.status(403).json({ message: "Acceso no autorizado." });
    }
    next();
};

router.get('/mis-pacientes', isDoctor, async (req, res) => {
    const doctorId = req.session.userId;
    try {
        const { rows } = await pool.query(`
            SELECT DISTINCT ON (p.id)
                p.id,
                p.nombres,
                p.apellidos,
                p.dni,
                p.email,
                p.telefono,
                p.fecha_nacimiento,
                -- Subconsulta para obtener la fecha de la última cita con ESTE doctor
                (SELECT MAX(c2.fecha_hora_inicio)
                 FROM citas c2
                 WHERE c2.paciente_usuario_id = p.id AND c2.doctor_usuario_id = $1) AS ultima_cita
            FROM usuarios p
            -- Unimos con citas para encontrar solo pacientes que han tenido cita con este doctor
            JOIN citas c ON p.id = c.paciente_usuario_id
            WHERE c.doctor_usuario_id = $1
            ORDER BY p.id, ultima_cita DESC;
        `, [doctorId]);
        
        res.json(rows);
    } catch (error) {
        console.error("Error al obtener la lista de pacientes:", error);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

export default router;