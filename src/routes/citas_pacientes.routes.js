import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

const isPatient = (req, res, next) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ message: "No autenticado." });
    }
    if (req.session.rolId !== 5) {
        return res.status(403).json({ message: "Acceso no autorizado." });
    }
    next();
};

router.get('/agendar/especialidades', async (req, res) => {
    try {
        const { rows } = await pool.query("SELECT id, nombre FROM especialidades ORDER BY nombre ASC");
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener especialidades." });
    }
});

router.get('/agendar/doctores/:especialidadId', async (req, res) => {
    const { especialidadId } = req.params;
    try {
        const { rows } = await pool.query(`
            SELECT u.id, u.nombres, u.apellidos FROM usuarios u
            JOIN doctores_especialidades de ON u.id = de.doctor_usuario_id
            WHERE de.especialidad_id = $1 AND u.esta_activo = true
        `, [especialidadId]);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener doctores." });
    }
});

router.get('/agendar/horario/:doctorId', async (req, res) => {
    const { doctorId } = req.params;
    const { fecha } = req.query;

    if (!fecha) return res.status(400).json({ message: "La fecha es requerida." });

    try {
        const diaSemana = new Date(fecha + 'T12:00:00Z').getUTCDay();

        const excepcionRes = await pool.query(
            "SELECT * FROM excepciones_horarios WHERE doctor_usuario_id = $1 AND fecha_excepcion = $2",
            [doctorId, fecha]
        );

        let horaInicioStr, horaFinStr, duracionCita;

        if (excepcionRes.rows.length > 0) {
            const ex = excepcionRes.rows[0];
            if (!ex.esta_disponible) return res.json([]);
            
            horaInicioStr = ex.hora_inicio;
            horaFinStr = ex.hora_fin;
            const horarioNormalRes = await pool.query("SELECT duracion_cita_minutos FROM horarios_doctores WHERE doctor_usuario_id = $1 LIMIT 1", [doctorId]);
            duracionCita = horarioNormalRes.rows.length > 0 ? horarioNormalRes.rows[0].duracion_cita_minutos : 30;
        } else {
            const horarioRes = await pool.query(
                "SELECT hora_inicio, hora_fin, duracion_cita_minutos FROM horarios_doctores WHERE doctor_usuario_id = $1 AND dia_semana = $2",
                [doctorId, diaSemana]
            );
            if (horarioRes.rows.length === 0) return res.json([]);
            
            const horario = horarioRes.rows[0];
            horaInicioStr = horario.hora_inicio;
            horaFinStr = horario.hora_fin;
            duracionCita = horario.duracion_cita_minutos;
        }
        
        const citasAgendadasRes = await pool.query(
            "SELECT fecha_hora_inicio FROM citas WHERE doctor_usuario_id = $1 AND DATE(fecha_hora_inicio AT TIME ZONE 'UTC') = $2 AND estado_cita_id != 4", // 4 = Cancelada
            [doctorId, fecha]
        );
        const citasOcupadas = new Set(citasAgendadasRes.rows.map(c => new Date(c.fecha_hora_inicio).toISOString()));

        const slotsDisponibles = [];
        const startDateTime = new Date(`${fecha}T${horaInicioStr}`);
        const endDateTime = new Date(`${fecha}T${horaFinStr}`);

        let slotActual = startDateTime;

        while (slotActual < endDateTime) {
            const slotISO = slotActual.toISOString();
            if (!citasOcupadas.has(slotISO)) {
                slotsDisponibles.push(slotISO);
            }
            slotActual.setMinutes(slotActual.getMinutes() + duracionCita);
        }
        
        res.json(slotsDisponibles);

    } catch (error) {
        console.error("Error al calcular horarios:", error);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

router.post('/citas', isPatient, async (req, res) => {
    const pacienteId = req.session.userId;
    const { doctor_usuario_id, fecha_hora_inicio, motivo_consulta } = req.body;

    try {
        const duracionRes = await pool.query("SELECT duracion_cita_minutos FROM horarios_doctores WHERE doctor_usuario_id = $1 LIMIT 1", [doctor_usuario_id]);
        const duracion = duracionRes.rows.length > 0 ? duracionRes.rows[0].duracion_cita_minutos : 30;
        
        const fechaInicio = new Date(fecha_hora_inicio);
        const fechaFin = new Date(fechaInicio.getTime() + duracion * 60000);

        const { rows } = await pool.query(
            `INSERT INTO citas (paciente_usuario_id, doctor_usuario_id, fecha_hora_inicio, fecha_hora_fin, estado_cita_id, motivo_consulta)
             VALUES ($1, $2, $3, $4, 1, $5) RETURNING id`, // Estado 1 = 'Programada'
            [pacienteId, doctor_usuario_id, fechaInicio, fechaFin, motivo_consulta]
        );

        res.status(201).json({ message: "Cita agendada correctamente.", citaId: rows[0].id });
    } catch (error) {
        console.error("Error al agendar cita:", error);
        if (error.code === '23505') {
            return res.status(409).json({ message: "El horario seleccionado ya no está disponible." });
        }
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

router.get('/mis-citas', isPatient, async (req, res) => {
    const pacienteId = req.session.userId;
    try {
        const { rows } = await pool.query(`
            SELECT c.id, c.fecha_hora_inicio, c.motivo_consulta, u.nombres || ' ' || u.apellidos as doctor, ec.nombre as estado
            FROM citas c
            JOIN usuarios u ON c.doctor_usuario_id = u.id
            JOIN estados_cita ec ON c.estado_cita_id = ec.id
            WHERE c.paciente_usuario_id = $1
            ORDER BY c.fecha_hora_inicio DESC
        `, [pacienteId]);
        res.json(rows);
    } catch (error) {
        console.error("Error al obtener mis citas:", error);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

router.put('/mis-citas/:citaId/cancelar', isPatient, async (req, res) => {
    const pacienteId = req.session.userId;
    const { citaId } = req.params;
    try {
        const { rowCount } = await pool.query(
            "UPDATE citas SET estado_cita_id = 4 WHERE id = $1 AND paciente_usuario_id = $2 AND estado_cita_id IN (1, 2) AND fecha_hora_inicio > NOW()", // 4 = 'Cancelada'
            [citaId, pacienteId]
        );

        if (rowCount === 0) {
            return res.status(404).json({ message: "La cita no se pudo cancelar. Puede que ya haya pasado o ya esté cancelada." });
        }
        res.status(200).json({ message: "Cita cancelada correctamente." });
    } catch (error) {
        console.error("Error al cancelar cita:", error);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

router.get('/mi-historial', isPatient, async (req, res) => {
    const pacienteId = req.session.userId;
    try {
        const { rows } = await pool.query(`
            SELECT
                hm.diagnostico,
                hm.receta_medica,
                hm.notas_doctor,
                c.fecha_hora_inicio as fecha_cita,
                u.nombres || ' ' || u.apellidos as doctor_nombre
            FROM historiales_medicos hm
            JOIN citas c ON hm.cita_id = c.id
            JOIN usuarios u ON c.doctor_usuario_id = u.id
            WHERE hm.paciente_usuario_id = $1
            ORDER BY c.fecha_hora_inicio DESC
        `, [pacienteId]);
        res.json(rows);
    } catch (error) {
        console.error("Error al obtener el historial del paciente:", error);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

export default router;