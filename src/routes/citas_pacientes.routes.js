import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();
const TIMEZONE_OFFSET = '-05:00';

const isPatient = (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ message: 'No autenticado.' });
  }
  if (req.session.rolId !== 5) {
    return res.status(403).json({ message: 'Acceso no autorizado.' });
  }
  next();
};

router.get('/agendar/especialidades', isPatient, async (req, res) => {
  try {
    const pacienteId = req.session.userId;

    const userRes = await pool.query(
      'SELECT genero_id FROM usuarios WHERE id = $1',
      [pacienteId]
    );

    if (userRes.rows.length === 0)
      return res.status(404).json({ message: 'Usuario no encontrado' });

    const generoId = userRes.rows[0].genero_id;

    let query = 'SELECT id, nombre FROM especialidades';

    if (generoId === 1) {
      query += ' WHERE id != 4';
    }

    query += ' ORDER BY nombre ASC';

    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (error) {
    console.error('Error al filtrar especialidades:', error);
    res.status(500).json({ message: 'Error al obtener especialidades.' });
  }
});

router.get('/agendar/doctores/:especialidadId', async (req, res) => {
  const { especialidadId } = req.params;
  try {
    const { rows } = await pool.query(
      `
            SELECT u.id, u.nombres, u.apellidos FROM usuarios u
            JOIN doctores_especialidades de ON u.id = de.doctor_usuario_id
            WHERE de.especialidad_id = $1 AND u.esta_activo = true
        `,
      [especialidadId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener doctores.' });
  }
});

router.get('/agendar/horario/:doctorId', async (req, res) => {
  const { doctorId } = req.params;
  const { fecha } = req.query;
  if (!fecha)
    return res.status(400).json({ message: 'La fecha es requerida.' });

  try {
    const diaSemana = new Date(fecha + 'T12:00:00').getUTCDay();

    const excepcionRes = await pool.query(
      'SELECT * FROM excepciones_horarios WHERE doctor_usuario_id = $1 AND fecha_excepcion = $2',
      [doctorId, fecha]
    );

    let horaInicioStr, horaFinStr, duracionCita;

    if (excepcionRes.rows.length > 0) {
      const ex = excepcionRes.rows[0];
      if (!ex.esta_disponible) return res.json([]);
      horaInicioStr = ex.hora_inicio;
      horaFinStr = ex.hora_fin;
      const horarioNormalRes = await pool.query(
        'SELECT duracion_cita_minutos FROM horarios_doctores WHERE doctor_usuario_id = $1 LIMIT 1',
        [doctorId]
      );
      duracionCita =
        horarioNormalRes.rows.length > 0
          ? horarioNormalRes.rows[0].duracion_cita_minutos
          : 30;
    } else {
      const horarioRes = await pool.query(
        'SELECT hora_inicio, hora_fin, duracion_cita_minutos FROM horarios_doctores WHERE doctor_usuario_id = $1 AND dia_semana = $2',
        [doctorId, diaSemana]
      );
      if (horarioRes.rows.length === 0) return res.json([]);
      ({
        hora_inicio: horaInicioStr,
        hora_fin: horaFinStr,
        duracion_cita_minutos: duracionCita,
      } = horarioRes.rows[0]);
    }

    const citasAgendadasRes = await pool.query(
      `SELECT fecha_hora_inicio FROM citas
             WHERE doctor_usuario_id = $1
             AND DATE(fecha_hora_inicio) = $2
             AND estado_cita_id != 4`,
      [doctorId, fecha]
    );

    const citasOcupadas = new Set(
      citasAgendadasRes.rows.map((c) =>
        new Date(c.fecha_hora_inicio + TIMEZONE_OFFSET).toISOString()
      )
    );

    const slotsDisponibles = [];
    let slotActual = new Date(`${fecha}T${horaInicioStr}${TIMEZONE_OFFSET}`);
    const endDateTime = new Date(`${fecha}T${horaFinStr}${TIMEZONE_OFFSET}`);

    while (slotActual < endDateTime) {
      const slotISO = slotActual.toISOString();
      if (!citasOcupadas.has(slotISO)) {
        slotsDisponibles.push(slotISO);
      }
      slotActual = new Date(slotActual.getTime() + duracionCita * 60000);
    }

    res.json(slotsDisponibles);
  } catch (error) {
    console.error('Error al calcular horarios:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// MODIFICADO: Incluye validación de máx. 2 citas y buffer de 30 minutos
router.post('/citas', isPatient, async (req, res) => {
  const pacienteId = req.session.userId;
  const { doctor_usuario_id, fecha_hora_inicio, motivo_consulta } = req.body;

  try {
    // 1. Obtener duración de la cita para el doctor seleccionado
    const duracionRes = await pool.query(
      'SELECT duracion_cita_minutos FROM horarios_doctores WHERE doctor_usuario_id = $1 LIMIT 1',
      [doctor_usuario_id]
    );
    const duracion =
      duracionRes.rows.length > 0
        ? duracionRes.rows[0].duracion_cita_minutos
        : 30;

    const fechaInicio = new Date(fecha_hora_inicio);
    const fechaFin = new Date(fechaInicio.getTime() + duracion * 60000);

    // 2. VALIDACIÓN: Máximo 2 citas por día para este paciente
    // Usamos DATE() para comparar el día sin importar la hora.
    const citasDelDiaRes = await pool.query(
      `SELECT count(*) FROM citas 
       WHERE paciente_usuario_id = $1 
       AND DATE(fecha_hora_inicio) = DATE($2) 
       AND estado_cita_id != 4`, // Ignoramos las canceladas
      [pacienteId, fechaInicio]
    );

    if (parseInt(citasDelDiaRes.rows[0].count) >= 2) {
      return res.status(400).json({
        message:
          'Has alcanzado el límite de 2 citas para este día. No puedes agendar más.',
      });
    }

    // 3. VALIDACIÓN: Buffer de 30 minutos entre citas del paciente
    // Traemos todas las citas activas del paciente para ese día
    const citasPacienteRes = await pool.query(
      `SELECT fecha_hora_inicio, fecha_hora_fin FROM citas 
       WHERE paciente_usuario_id = $1 
       AND estado_cita_id != 4
       AND DATE(fecha_hora_inicio) = DATE($2)`,
      [pacienteId, fechaInicio]
    );

    const BUFFER_MS = 30 * 60 * 1000; // 30 minutos en milisegundos

    for (const cita of citasPacienteRes.rows) {
      const citaExistenteInicio = new Date(cita.fecha_hora_inicio).getTime();
      const citaExistenteFin = new Date(cita.fecha_hora_fin).getTime();
      const nuevaInicio = fechaInicio.getTime();
      const nuevaFin = fechaFin.getTime();

      // Comprobamos si la nueva cita "choca" con el rango de la existente + el buffer.
      // La lógica es: Hay conflicto si la nueva cita empieza antes de que termine la existente + 30min
      // Y termina después de que empiece la existente - 30min.

      const limiteInferior = citaExistenteInicio - BUFFER_MS;
      const limiteSuperior = citaExistenteFin + BUFFER_MS;

      if (nuevaInicio < limiteSuperior && nuevaFin > limiteInferior) {
        return res.status(400).json({
          message:
            'Debe haber un espacio de al menos 30 minutos entre tus citas para trasladarte.',
        });
      }
    }

    // 4. Verificar disponibilidad del Doctor (Que no tenga otra cita en ese horario exacto)
    const cruceCitasDoctor = await pool.query(
      `SELECT id FROM citas 
             WHERE doctor_usuario_id = $1 
             AND estado_cita_id != 4 
             AND (
                (fecha_hora_inicio < $3 AND fecha_hora_fin > $2)
             )`,
      [doctor_usuario_id, fechaInicio, fechaFin]
    );

    if (cruceCitasDoctor.rows.length > 0) {
      return res.status(400).json({
        message:
          'El doctor ya tiene una cita agendada en este horario o se solapa.',
      });
    }

    // 5. Insertar la cita
    const { rows } = await pool.query(
      `INSERT INTO citas (paciente_usuario_id, doctor_usuario_id, fecha_hora_inicio, fecha_hora_fin, estado_cita_id, motivo_consulta)
             VALUES ($1, $2, $3, $4, 1, $5) RETURNING id`,
      [pacienteId, doctor_usuario_id, fechaInicio, fechaFin, motivo_consulta]
    );

    res
      .status(201)
      .json({ message: 'Cita agendada correctamente.', citaId: rows[0].id });
  } catch (error) {
    console.error('Error al agendar cita:', error);
    if (error.code === '23505') {
      return res
        .status(409)
        .json({ message: 'El horario seleccionado ya no está disponible.' });
    }
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

router.get('/mis-citas', isPatient, async (req, res) => {
  const pacienteId = req.session.userId;
  try {
    const { rows } = await pool.query(
      `
            SELECT c.id, c.fecha_hora_inicio, c.motivo_consulta, u.nombres || ' ' || u.apellidos AS doctor, ec.nombre AS estado
            FROM citas c
            JOIN usuarios u ON c.doctor_usuario_id = u.id
            JOIN estados_cita ec ON c.estado_cita_id = ec.id
            WHERE c.paciente_usuario_id = $1
            ORDER BY c.fecha_hora_inicio DESC
        `,
      [pacienteId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener mis citas:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

router.put('/mis-citas/:citaId/cancelar', isPatient, async (req, res) => {
  const pacienteId = req.session.userId;
  const { citaId } = req.params;
  try {
    const { rowCount } = await pool.query(
      `UPDATE citas
             SET estado_cita_id = 4
             WHERE id = $1
             AND paciente_usuario_id = $2
             AND estado_cita_id != 4
             AND fecha_hora_inicio > NOW()`,
      [citaId, pacienteId]
    );

    if (rowCount === 0) {
      return res.status(400).json({
        message:
          'No se pudo cancelar la cita. Tal vez ya está cancelada o ya pasó la fecha.',
      });
    }

    res.status(200).json({ message: 'Cita cancelada correctamente.' });
  } catch (error) {
    console.error('Error al cancelar cita:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

router.get('/mi-historial', isPatient, async (req, res) => {
  const pacienteId = req.session.userId;
  try {
    const { rows } = await pool.query(
      `
            SELECT hm.diagnostico, hm.receta_medica, hm.notas_doctor,
                   c.fecha_hora_inicio AS fecha_cita,
                   u.nombres || ' ' || u.apellidos AS doctor_nombre
            FROM historiales_medicos hm
            JOIN citas c ON hm.cita_id = c.id
            JOIN usuarios u ON c.doctor_usuario_id = u.id
            WHERE hm.paciente_usuario_id = $1
            ORDER BY c.fecha_hora_inicio DESC
        `,
      [pacienteId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener el historial del paciente:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

export default router;
