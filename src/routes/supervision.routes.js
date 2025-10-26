import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

router.get('/supervision/citas', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT 
                c.id,
                c.fecha_hora_inicio,
                c.fecha_hora_fin,
                c.motivo_consulta,
                paciente.nombres || ' ' || paciente.apellidos AS nombre_paciente,
                paciente.dni AS dni_paciente,
                doctor.nombres || ' ' || doctor.apellidos AS nombre_doctor,
                ARRAY_AGG(esp.nombre) AS especialidades_doctor,
                ec.nombre AS estado_cita,
                ec.id AS estado_cita_id
            FROM citas c
            JOIN usuarios paciente ON c.paciente_usuario_id = paciente.id
            JOIN usuarios doctor ON c.doctor_usuario_id = doctor.id
            JOIN estados_cita ec ON c.estado_cita_id = ec.id
            LEFT JOIN doctores_especialidades de ON doctor.id = de.doctor_usuario_id
            LEFT JOIN especialidades esp ON de.especialidad_id = esp.id
            GROUP BY c.id, nombre_paciente, dni_paciente, nombre_doctor, ec.nombre, ec.id
            ORDER BY c.fecha_hora_inicio DESC;
        `);
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener las citas para supervisión:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

export default router;