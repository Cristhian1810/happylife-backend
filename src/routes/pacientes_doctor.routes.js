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

router.get('/mis-pacientes/:pacienteId/historial', isDoctor, async (req, res) => {
    const { pacienteId } = req.params;
    const doctorId = req.session.userId;
    try {
        const { rows } = await pool.query(`
            SELECT 
                hm.id,
                hm.diagnostico,
                hm.receta_medica,
                hm.notas_doctor,
                hm.fecha_creacion,
                c.fecha_hora_inicio as fecha_cita
            FROM historiales_medicos hm
            JOIN citas c ON hm.cita_id = c.id
            WHERE hm.paciente_usuario_id = $1 
              AND c.doctor_usuario_id = $2 -- Asegura que el doctor solo vea registros de sus propias citas
            ORDER BY hm.fecha_creacion DESC
        `, [pacienteId, doctorId]);
        res.json(rows);
    } catch (error) {
        console.error("Error al obtener historial:", error);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

router.post('/historial-medico', isDoctor, async (req, res) => {
    const { cita_id, paciente_usuario_id, diagnostico, receta_medica, notas_doctor } = req.body;
    
    const citaCheck = await pool.query("SELECT doctor_usuario_id FROM citas WHERE id = $1", [cita_id]);
    if (citaCheck.rows.length === 0 || citaCheck.rows[0].doctor_usuario_id !== req.session.userId) {
        return res.status(403).json({ message: "No tiene permiso para registrar en esta cita." });
    }

    try {
        const query = `
            INSERT INTO historiales_medicos (cita_id, paciente_usuario_id, diagnostico, receta_medica, notas_doctor)
            VALUES ($1, $2, $3, $4, $5) RETURNING *
        `;
        const { rows } = await pool.query(query, [cita_id, paciente_usuario_id, diagnostico, receta_medica, notas_doctor]);
        res.status(201).json({ message: "Historial guardado con éxito.", entry: rows[0] });
    } catch (error) {
        console.error("Error al crear historial:", error);
         if (error.code === '23505') { // Cita_id ya tiene un historial
            return res.status(409).json({ message: "Ya existe un registro de historial para esta cita." });
        }
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

export default router;