import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

const simulateUserSession = (req, res, next) => {
    const { rol } = req.query;
    if (rol) {
        req.session = req.session || {};
        switch (rol.toLowerCase()) {
            case 'superadmin':
                req.session.rolId = 1;
                break;
            case 'admin':
                req.session.rolId = 2;
                break;
            case 'doctor':
                req.session.rolId = 3;
                req.session.userId = 'ID_DEL_DOCTOR_DE_PRUEBA';
                break;
            case 'recepcionista':
                req.session.rolId = 4;
                break;
            case 'paciente':
                req.session.rolId = 5;
                req.session.userId = 'ID_DEL_PACIENTE_DE_PRUEBA';
                break;
        }
    }
    next();
};

router.get('/dashboard/stats', simulateUserSession, async (req, res) => {

    const userRole = req.session.rolId;
    const userId = req.session.userId;
    
    if (!userRole) {
        return res.status(401).json({ message: "No autenticado." });
    }

    try {
        let stats = {};

        if (userRole === 1) {
            const [totalUsers, totalDoctors, totalAppointments] = await Promise.all([
                pool.query("SELECT COUNT(*) FROM usuarios WHERE esta_activo = true"),
                pool.query("SELECT COUNT(*) FROM usuarios WHERE rol_id = 3 AND esta_activo = true"),
                pool.query("SELECT COUNT(*) FROM citas WHERE estado_cita_id != 4"),
            ]);
            stats = {
                dashboardType: 'Super Administrador',
                cards: [
                    { title: 'Usuarios Activos', value: totalUsers.rows[0].count, icon: 'bi-people-fill' },
                    { title: 'Doctores Activos', value: totalDoctors.rows[0].count, icon: 'bi-heart-pulse-fill' },
                    { title: 'Citas Totales', value: totalAppointments.rows[0].count, icon: 'bi-calendar-heart' },
                ]
            };
        }

        else if (userRole === 2) {
            const [doctorsInClinic, appointmentsToday, upcomingAppointments] = await Promise.all([
                pool.query("SELECT COUNT(*) FROM usuarios WHERE rol_id = 3 AND esta_activo = true"),
                pool.query("SELECT COUNT(*) FROM citas WHERE DATE(fecha_hora_inicio) = CURRENT_DATE AND estado_cita_id != 4"),
                pool.query("SELECT COUNT(*) FROM citas WHERE fecha_hora_inicio >= NOW() AND estado_cita_id IN (1, 2)")
            ]);
            stats = {
                dashboardType: 'Administrador de Clínica',
                cards: [
                    { title: 'Doctores en Clínica', value: doctorsInClinic.rows[0].count, icon: 'bi-heart-pulse-fill' },
                    { title: 'Citas para Hoy', value: appointmentsToday.rows[0].count, icon: 'bi-calendar-check-fill' },
                    { title: 'Citas Próximas', value: upcomingAppointments.rows[0].count, icon: 'bi-calendar-event-fill' },
                ]
            };
        }

        else if (userRole === 3) {
            const [appointmentsToday, upcomingAppointments, nextPatient] = await Promise.all([
                pool.query("SELECT COUNT(*) FROM citas WHERE doctor_usuario_id = $1 AND DATE(fecha_hora_inicio) = CURRENT_DATE AND estado_cita_id IN (1, 2)", [userId]),
                pool.query("SELECT COUNT(*) FROM citas WHERE doctor_usuario_id = $1 AND fecha_hora_inicio > NOW() AND estado_cita_id IN (1, 2)", [userId]),
                pool.query(`
                    SELECT p.nombres || ' ' || p.apellidos as nombre_paciente, c.fecha_hora_inicio, c.motivo_consulta
                    FROM citas c JOIN usuarios p ON c.paciente_usuario_id = p.id
                    WHERE c.doctor_usuario_id = $1 AND c.fecha_hora_inicio >= NOW() AND c.estado_cita_id IN (1, 2)
                    ORDER BY c.fecha_hora_inicio ASC LIMIT 1
                `, [userId])
            ]);
            stats = {
                dashboardType: 'Doctor',
                cards: [
                    { title: 'Citas Hoy', value: appointmentsToday.rows[0].count, icon: 'bi-calendar-check-fill' },
                    { title: 'Citas Pendientes', value: upcomingAppointments.rows[0].count, icon: 'bi-calendar-event-fill' },
                ],
                activityTitle: 'Próximo Paciente',
                activity: nextPatient.rows[0]
            };
        }

        else if (userRole === 4) {
             const [appointmentsToday, newPatientsToday, pendingConfirmation] = await Promise.all([
                pool.query("SELECT COUNT(*) FROM citas WHERE DATE(fecha_hora_inicio) = CURRENT_DATE"),
                pool.query("SELECT COUNT(*) FROM usuarios WHERE rol_id = 5 AND DATE(fecha_creacion) = CURRENT_DATE"),
                pool.query("SELECT COUNT(*) FROM citas WHERE estado_cita_id = 1 AND fecha_hora_inicio > NOW()"), // Programada
            ]);
            stats = {
                dashboardType: 'Recepcionista',
                cards: [
                    { title: 'Citas de Hoy', value: appointmentsToday.rows[0].count, icon: 'bi-calendar-day' },
                    { title: 'Pacientes Nuevos Hoy', value: newPatientsToday.rows[0].count, icon: 'bi-person-plus-fill' },
                    { title: 'Citas por Confirmar', value: pendingConfirmation.rows[0].count, icon: 'bi-patch-question-fill' },
                ]
            };
        }

        else if (userRole === 5) {
             const [upcomingAppointments, pastAppointments, nextAppointment] = await Promise.all([
                pool.query("SELECT COUNT(*) FROM citas WHERE paciente_usuario_id = $1 AND fecha_hora_inicio >= NOW() AND estado_cita_id IN (1, 2)", [userId]),
                pool.query("SELECT COUNT(*) FROM citas WHERE paciente_usuario_id = $1 AND fecha_hora_inicio < NOW() AND estado_cita_id = 3", [userId]),
                pool.query(`
                    SELECT d.nombres || ' ' || d.apellidos as nombre_doctor, c.fecha_hora_inicio, ARRAY_AGG(e.nombre) as especialidades
                    FROM citas c 
                    JOIN usuarios d ON c.doctor_usuario_id = d.id
                    LEFT JOIN doctores_especialidades de ON d.id = de.doctor_usuario_id
                    LEFT JOIN especialidades e ON de.especialidad_id = e.id
                    WHERE c.paciente_usuario_id = $1 AND c.fecha_hora_inicio >= NOW() AND c.estado_cita_id IN (1, 2)
                    GROUP BY d.nombres, d.apellidos, c.fecha_hora_inicio
                    ORDER BY c.fecha_hora_inicio ASC LIMIT 1
                `, [userId])
            ]);
            stats = {
                dashboardType: 'Paciente',
                cards: [
                    { title: 'Próximas Citas', value: upcomingAppointments.rows[0].count, icon: 'bi-calendar-event-fill' },
                    { title: 'Historial de Citas', value: pastAppointments.rows[0].count, icon: 'bi-collection-fill' },
                ],
                activityTitle: 'Tu Próxima Cita',
                activity: nextAppointment.rows[0]
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