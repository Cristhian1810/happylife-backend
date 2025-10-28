import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

const isDoctor = (req, res, next) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ message: "No autenticado." });
    }
    if (req.session.rolId !== 3) { // Asumiendo que 3 es el rol de Doctor
        return res.status(403).json({ message: "Acceso no autorizado." });
    }
    next();
};

router.get('/mis-pacientes', isDoctor, async (req, res) => {
    const doctorId = req.session.userId;
    try {
        const { rows } = await pool.query(`
            SELECT DISTINCT ON (p.id)
                p.id, p.nombres, p.apellidos, p.dni, p.email, p.telefono, p.fecha_nacimiento,
                pp.alergias,
                ts.nombre AS tipo_sangre_nombre,
                (SELECT MAX(c2.fecha_hora_inicio)
                 FROM citas c2
                 WHERE c2.paciente_usuario_id = p.id AND c2.doctor_usuario_id = $1) AS ultima_cita
            FROM usuarios p
            JOIN perfiles_pacientes pp ON p.id = pp.usuario_id
            LEFT JOIN tipo_sangre ts ON pp.tipo_sangre_id = ts.id
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
        const patientBelongsToDoctor = await pool.query(
            "SELECT 1 FROM citas WHERE paciente_usuario_id = $1 AND doctor_usuario_id = $2 LIMIT 1",
            [pacienteId, doctorId]
        );
        
        if (patientBelongsToDoctor.rowCount === 0) {
            return res.status(403).json({ message: "No tienes citas registradas con este paciente." });
        }

        const { rows } = await pool.query(`
            SELECT 
                hm.id,
                hm.diagnostico,
                hm.receta_medica,
                hm.notas_doctor,
                hm.fecha_creacion,
                c.id as cita_id,
                c.fecha_hora_inicio as fecha_cita,
                c.estado_cita_id,
                e_cita.nombre as estado_cita_nombre,
                u_doc.nombres || ' ' || u_doc.apellidos as nombre_doctor,
                ARRAY_AGG(e.nombre) FILTER (WHERE e.id IS NOT NULL) as especialidades
            FROM citas c
            LEFT JOIN historiales_medicos hm ON hm.cita_id = c.id
            JOIN usuarios u_doc ON c.doctor_usuario_id = u_doc.id
            JOIN estados_cita e_cita ON c.estado_cita_id = e_cita.id
            LEFT JOIN doctores_especialidades de ON u_doc.id = de.doctor_usuario_id
            LEFT JOIN especialidades e ON de.especialidad_id = e.id
            WHERE c.paciente_usuario_id = $1 AND c.doctor_usuario_id = $2
            GROUP BY hm.id, c.id, e_cita.nombre, u_doc.id
            ORDER BY c.fecha_hora_inicio DESC
        `, [pacienteId, doctorId]);
        res.json(rows);
    } catch (error) {
        console.error("Error al obtener historial:", error);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

router.post('/historial-medico', isDoctor, async (req, res) => {
    const { cita_id, diagnostico, receta_medica, notas_doctor } = req.body;
    const doctorId = req.session.userId;

    if (!cita_id || !diagnostico) {
        return res.status(400).json({ message: "La cita y el diagnóstico son obligatorios." });
    }

    try {
        const citaCheck = await pool.query("SELECT doctor_usuario_id, paciente_usuario_id FROM citas WHERE id = $1", [cita_id]);
        if (citaCheck.rows.length === 0 || citaCheck.rows[0].doctor_usuario_id !== doctorId) {
            return res.status(403).json({ message: "No tiene permiso para registrar en esta cita." });
        }

        const paciente_usuario_id = citaCheck.rows[0].paciente_usuario_id;
        const query = `
            INSERT INTO historiales_medicos (cita_id, paciente_usuario_id, diagnostico, receta_medica, notas_doctor)
            VALUES ($1, $2, $3, $4, $5) RETURNING *
        `;
        const { rows } = await pool.query(query, [cita_id, paciente_usuario_id, diagnostico, receta_medica, notas_doctor]);
        
        await pool.query("UPDATE citas SET estado_cita_id = 3 WHERE id = $1", [cita_id]);

        res.status(201).json({ message: "Historial guardado con éxito.", entry: rows[0] });
    } catch (error) {
        console.error("Error al crear historial:", error);
        if (error.code === '23505') { // unique_violation
            return res.status(409).json({ message: "Ya existe un registro de historial para esta cita." });
        }
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

router.get('/mis-pacientes/:pacienteId/citas-sin-historial', isDoctor, async (req, res) => {
    const doctorId = req.session.userId;
    const { pacienteId } = req.params;
    try {
        const { rows } = await pool.query(`
            SELECT c.id, c.fecha_hora_inicio
            FROM citas c
            LEFT JOIN historiales_medicos hm ON c.id = hm.cita_id
            WHERE c.doctor_usuario_id = $1
              AND c.paciente_usuario_id = $2
              AND c.fecha_hora_inicio <= NOW()
              AND hm.id IS NULL
            ORDER BY c.fecha_hora_inicio DESC
        `, [doctorId, pacienteId]);
        res.json(rows);
    } catch (error) {
        console.error("Error al obtener citas sin historial:", error);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

router.put('/citas/:citaId/estado', isDoctor, async (req, res) => {
    const doctorId = req.session.userId;
    const { citaId } = req.params;
    const { estado_cita_id } = req.body;

    if (!estado_cita_id) {
        return res.status(400).json({ message: 'El ID del nuevo estado es requerido.' });
    }

    try {
        const { rowCount } = await pool.query(
            `UPDATE citas SET estado_cita_id = $1 
             WHERE id = $2 AND doctor_usuario_id = $3`,
            [estado_cita_id, citaId, doctorId]
        );

        if (rowCount === 0) {
            return res.status(404).json({ message: 'Cita no encontrada o no tiene permiso para modificarla.' });
        }
        res.status(200).json({ message: 'Estado de la cita actualizado correctamente.' });
    } catch (error) {
        console.error("Error al actualizar estado de la cita:", error);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

export default router;