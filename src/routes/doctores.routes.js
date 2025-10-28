import { Router } from "express";
import { pool } from "../db.js";
import bcrypt from 'bcryptjs';

const router = Router();

router.get('/doctores', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT
                u.id, u.email, u.dni, u.nombres, u.apellidos, u.telefono, u.esta_activo, u.fecha_creacion,
                pd.numero_colegiatura, pd.biografia,
                tp.id as titulo_profesional_id, tp.nombre as titulo_profesional,
                ARRAY_AGG(e.nombre) FILTER (WHERE e.id IS NOT NULL) as especialidades
            FROM usuarios u
            JOIN perfiles_doctores pd ON u.id = pd.usuario_id
            LEFT JOIN titulos_profesionales tp ON pd.titulo_profesional_id = tp.id
            LEFT JOIN doctores_especialidades de ON u.id = de.doctor_usuario_id
            LEFT JOIN especialidades e ON de.especialidad_id = e.id
            WHERE u.rol_id = 3
            -- 👇 LÍNEA CORREGIDA 👇
            GROUP BY u.id, pd.usuario_id, tp.id
            ORDER BY u.nombres ASC
        `);
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener doctores:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

router.get('/doctores/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const { rows } = await pool.query(`
            SELECT
                u.id, u.email, u.dni, u.nombres, u.apellidos, u.telefono, u.esta_activo,
                pd.numero_colegiatura, pd.biografia, pd.titulo_profesional_id,
                (SELECT ARRAY_AGG(especialidad_id) FROM doctores_especialidades WHERE doctor_usuario_id = u.id) as especialidades_ids
            FROM usuarios u
            JOIN perfiles_doctores pd ON u.id = pd.usuario_id
            WHERE u.id = $1 AND u.rol_id = 3
        `, [id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Doctor no encontrado.' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error('Error al obtener doctor:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

router.post('/doctores', async (req, res) => {
    const { nombres, apellidos, dni, email, password, telefono, numero_colegiatura, biografia, titulo_profesional_id, especialidades } = req.body;
    
    if (!especialidades || !Array.isArray(especialidades) || especialidades.length === 0) {
        return res.status(400).json({ message: 'Debe seleccionar al menos una especialidad.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const existingUser = await client.query('SELECT * FROM usuarios WHERE email = $1 OR dni = $2', [email, dni]);
        if (existingUser.rowCount > 0) {
            if (existingUser.rows[0].email === email) return res.status(409).json({ message: 'El correo electrónico ya está registrado.' });
            if (existingUser.rows[0].dni === dni) return res.status(409).json({ message: 'El DNI ya está registrado.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const userInsertQuery = 'INSERT INTO usuarios (email, password_hash, dni, nombres, apellidos, telefono, rol_id) VALUES ($1, $2, $3, $4, $5, $6, 3) RETURNING id';
        const userResult = await client.query(userInsertQuery, [email, hashedPassword, dni, nombres, apellidos, telefono]);
        const usuarioId = userResult.rows[0].id;

        const profileInsertQuery = 'INSERT INTO perfiles_doctores (usuario_id, numero_colegiatura, biografia, titulo_profesional_id) VALUES ($1, $2, $3, $4)';
        await client.query(profileInsertQuery, [usuarioId, numero_colegiatura, biografia, titulo_profesional_id]);

        const specialtyInsertQuery = 'INSERT INTO doctores_especialidades (doctor_usuario_id, especialidad_id) VALUES ($1, $2)';
        for (const especialidad_id of especialidades) {
            await client.query(specialtyInsertQuery, [usuarioId, especialidad_id]);
        }

        await client.query('COMMIT');
        res.status(201).json({ message: "Doctor registrado correctamente", usuarioId });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en el registro de doctor:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    } finally {
        client.release();
    }
});

router.put('/doctores/:id', async (req, res) => {
    const { id } = req.params;
    const { nombres, apellidos, email, telefono, esta_activo, numero_colegiatura, biografia, titulo_profesional_id, especialidades } = req.body;

    if (!especialidades || !Array.isArray(especialidades) || especialidades.length === 0) {
        return res.status(400).json({ message: 'Debe seleccionar al menos una especialidad.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const existingUser = await client.query('SELECT id FROM usuarios WHERE email = $1 AND id != $2', [email, id]);
        if (existingUser.rowCount > 0) {
             return res.status(409).json({ message: 'El correo electrónico ya está en uso por otro usuario.' });
        }

        const updateUserQuery = `
            UPDATE usuarios 
            SET nombres = $1, apellidos = $2, email = $3, telefono = $4, esta_activo = COALESCE($5, esta_activo) 
            WHERE id = $6 AND rol_id = 3 
            RETURNING id
        `;
        const userResult = await client.query(updateUserQuery, [nombres, apellidos, email, telefono, esta_activo, id]);
        
        if (userResult.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Doctor no encontrado.' });
        }

        const updateProfileQuery = `UPDATE perfiles_doctores SET numero_colegiatura = $1, biografia = $2, titulo_profesional_id = $3 WHERE usuario_id = $4`;
        await client.query(updateProfileQuery, [numero_colegiatura, biografia, titulo_profesional_id, id]);
        
        await client.query('DELETE FROM doctores_especialidades WHERE doctor_usuario_id = $1', [id]);

        const specialtyInsertQuery = 'INSERT INTO doctores_especialidades (doctor_usuario_id, especialidad_id) VALUES ($1, $2)';
        for (const especialidad_id of especialidades) {
            await client.query(specialtyInsertQuery, [id, especialidad_id]);
        }

        await client.query('COMMIT');
        res.json({ message: 'Doctor actualizado correctamente' });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al actualizar doctor:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    } finally {
        client.release();
    }
});

router.delete('/doctores/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const { rowCount } = await pool.query('UPDATE usuarios SET esta_activo = false WHERE id = $1 AND rol_id = 3', [id]);
        if (rowCount === 0) {
            return res.status(404).json({ message: 'Doctor no encontrado.' });
        }
        res.status(200).json({ message: 'Doctor desactivado correctamente.' });
    } catch (error) {
        console.error('Error al desactivar doctor:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});


export default router;