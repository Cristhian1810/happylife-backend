import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

router.get('/dashboard/stats', async (req, res) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ message: "No autenticado. Sesión no encontrada." });
    }
    const userRole = req.session.rolId;
    const userId = req.session.userId;
    
    try {
        let stats = {};

        if (userRole === 1 || userRole === 2) {
            const [cardsData, userGrowth, appointmentsByStatus] = await Promise.all([
                pool.query(`SELECT
                    (SELECT COUNT(*) FROM usuarios WHERE esta_activo = true) as total_users,
                    (SELECT COUNT(*) FROM usuarios WHERE rol_id = 3 AND esta_activo = true) as total_doctors,
                    (SELECT COUNT(*) FROM citas WHERE fecha_hora_inicio >= NOW() AND estado_cita_id IN (1, 2)) as upcoming_appointments
                `),
                pool.query(`SELECT DATE_TRUNC('day', fecha_creacion) as dia, COUNT(*) as nuevos_usuarios
                            FROM usuarios WHERE fecha_creacion >= NOW() - INTERVAL '7 days'
                            GROUP BY dia ORDER BY dia ASC`),
                pool.query(`SELECT ec.nombre, COUNT(c.id) as total
                            FROM citas c JOIN estados_cita ec ON c.estado_cita_id = ec.id
                            GROUP BY ec.nombre ORDER BY total DESC`)
            ]);
            stats = {
                dashboardType: userRole === 1 ? 'Super Administrador' : 'Administrador',
                cards: [
                    { title: 'Usuarios Activos', value: cardsData.rows[0].total_users, icon: 'bi-people-fill' },
                    { title: 'Doctores Activos', value: cardsData.rows[0].total_doctors, icon: 'bi-heart-pulse-fill' },
                    { title: 'Citas Próximas', value: cardsData.rows[0].upcoming_appointments, icon: 'bi-calendar-event-fill' },
                ],
                charts: {
                    userGrowth: {
                        labels: userGrowth.rows.map(r => new Date(r.dia).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })),
                        data: userGrowth.rows.map(r => r.nuevos_usuarios)
                    },
                    appointmentsByStatus: {
                        labels: appointmentsByStatus.rows.map(r => r.nombre),
                        data: appointmentsByStatus.rows.map(r => r.total)
                    }
                }
            };
        }
        
        else if (userRole === 3) {
            const [cardsData, appointmentsToday, weeklyPerformance] = await Promise.all([
                pool.query(`SELECT
                    (SELECT COUNT(*) FROM citas WHERE doctor_usuario_id = $1 AND DATE(fecha_hora_inicio) = CURRENT_DATE AND estado_cita_id IN (1,2)) as today_appointments,
                    (SELECT COUNT(*) FROM citas WHERE doctor_usuario_id = $1 AND fecha_hora_inicio > NOW() AND estado_cita_id IN (1,2)) as pending_appointments
                `, [userId]),
                pool.query(`SELECT c.id, c.fecha_hora_inicio, u.nombres || ' ' || u.apellidos as paciente
                            FROM citas c JOIN usuarios u ON c.paciente_usuario_id = u.id
                            WHERE c.doctor_usuario_id = $1 AND DATE(c.fecha_hora_inicio) = CURRENT_DATE
                            ORDER BY c.fecha_hora_inicio ASC`, [userId]),
                pool.query(`SELECT ec.nombre, COUNT(c.id) as total
                            FROM citas c JOIN estados_cita ec ON c.estado_cita_id = ec.id
                            WHERE c.doctor_usuario_id = $1 AND c.fecha_hora_inicio >= NOW() - INTERVAL '7 days'
                            GROUP BY ec.nombre`, [userId])
            ]);
            stats = {
                dashboardType: 'Doctor',
                cards: [
                    { title: 'Citas para Hoy', value: cardsData.rows[0].today_appointments, icon: 'bi-calendar-check-fill' },
                    { title: 'Citas Pendientes', value: cardsData.rows[0].pending_appointments, icon: 'bi-calendar-week-fill' }
                ],
                tables: {
                    title: 'Agenda de Hoy',
                    headers: ['Hora', 'Paciente'],
                    rows: appointmentsToday.rows.map(r => [new Date(r.fecha_hora_inicio).toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'}), r.paciente])
                },
                charts: {
                    weeklyPerformance: {
                        labels: weeklyPerformance.rows.map(r => r.nombre),
                        data: weeklyPerformance.rows.map(r => r.total)
                    }
                }
            };
        }

        else if (userRole === 4) {
            const [cardsData, appointmentsToday] = await Promise.all([
                 pool.query(`SELECT
                    (SELECT COUNT(*) FROM citas WHERE DATE(fecha_hora_inicio) = CURRENT_DATE) as today_appointments,
                    (SELECT COUNT(*) FROM usuarios WHERE rol_id = 5 AND DATE(fecha_creacion) = CURRENT_DATE) as new_patients,
                    (SELECT COUNT(*) FROM citas WHERE estado_cita_id = 1 AND fecha_hora_inicio > NOW()) as to_confirm
                `),
                pool.query(`SELECT c.fecha_hora_inicio, u_pac.nombres as paciente, u_doc.nombres as doctor, ec.nombre as estado
                            FROM citas c 
                            JOIN usuarios u_pac ON c.paciente_usuario_id = u_pac.id
                            JOIN usuarios u_doc ON c.doctor_usuario_id = u_doc.id
                            JOIN estados_cita ec ON c.estado_cita_id = ec.id
                            WHERE DATE(c.fecha_hora_inicio) = CURRENT_DATE ORDER BY c.fecha_hora_inicio ASC`)
            ]);
            stats = {
                dashboardType: 'Recepcionista',
                cards: [
                    { title: 'Citas del Día', value: cardsData.rows[0].today_appointments, icon: 'bi-calendar-day' },
                    { title: 'Nuevos Pacientes Hoy', value: cardsData.rows[0].new_patients, icon: 'bi-person-plus-fill' },
                    { title: 'Citas por Confirmar', value: cardsData.rows[0].to_confirm, icon: 'bi-patch-question-fill' },
                ],
                tables: {
                    title: 'Flujo de Citas de Hoy',
                    headers: ['Hora', 'Paciente', 'Doctor', 'Estado'],
                    rows: appointmentsToday.rows.map(r => [new Date(r.fecha_hora_inicio).toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'}), r.paciente, r.doctor, r.estado])
                }
            };
        }

        else if (userRole === 5) {
            const [cardsData, nextAppointment, medicalHistory] = await Promise.all([
                 pool.query(`SELECT
                    (SELECT COUNT(*) FROM citas WHERE paciente_usuario_id = $1 AND fecha_hora_inicio >= NOW() AND estado_cita_id IN (1, 2)) as upcoming_appointments,
                    (SELECT COUNT(*) FROM historiales_medicos WHERE paciente_usuario_id = $1) as medical_records
                 `, [userId]),
                pool.query(`
                    SELECT c.fecha_hora_inicio, u.nombres || ' ' || u.apellidos as doctor, e.nombre as especialidad
                    FROM citas c JOIN usuarios u ON c.doctor_usuario_id = u.id
                    LEFT JOIN doctores_especialidades de ON u.id = de.doctor_usuario_id LEFT JOIN especialidades e ON de.especialidad_id = e.id
                    WHERE c.paciente_usuario_id = $1 AND c.fecha_hora_inicio >= NOW() AND c.estado_cita_id IN (1,2)
                    GROUP BY c.fecha_hora_inicio, u.nombres, u.apellidos, e.nombre
                    ORDER BY c.fecha_hora_inicio ASC LIMIT 1
                `, [userId]),
                pool.query(`
                    SELECT hm.fecha_creacion, u.nombres || ' ' || u.apellidos as doctor, hm.diagnostico
                    FROM historiales_medicos hm JOIN citas c ON hm.cita_id = c.id JOIN usuarios u ON c.doctor_usuario_id = u.id
                    WHERE hm.paciente_usuario_id = $1 ORDER BY hm.fecha_creacion DESC LIMIT 5
                `, [userId])
            ]);
            stats = {
                dashboardType: 'Paciente',
                cards: [
                    { title: 'Próximas Citas', value: cardsData.rows[0].upcoming_appointments, icon: 'bi-calendar-event-fill' },
                    { title: 'Registros Médicos', value: cardsData.rows[0].medical_records, icon: 'bi-file-earmark-medical' }
                ],
                activityTitle: 'Tu Próxima Cita',
                activity: nextAppointment.rows[0] || null,
                tables: {
                    title: 'Historial Médico Reciente',
                    headers: ['Fecha', 'Doctor', 'Diagnóstico'],
                    rows: medicalHistory.rows.map(r => [new Date(r.fecha_creacion).toLocaleDateString('es-ES'), r.doctor, r.diagnostico])
                }
            };
        }
        else {
             return res.status(403).json({ message: "Rol no válido para dashboard." });
        }
        return res.json(stats);
    } catch (error) {
        console.error("Error al obtener estadísticas del dashboard:", error);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

export default router;