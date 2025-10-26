import { Router } from "express";
import { pool } from "../db.js";
import bcrypt from 'bcryptjs';

const router = Router();

router.get('/perfil', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'No estás autenticado.' });
    }
    const usuarioId = req.session.userId;

    try {
        const userResult = await pool.query('SELECT * FROM usuarios WHERE id = $1', [usuarioId]);
        if (userResult.rowCount === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }
        
        const user = userResult.rows[0];
        delete user.password_hash;

        if (user.rol_id === 5) {
            const patientProfileResult = await pool.query(
                'SELECT alergias, tipo_sangre_id FROM perfiles_pacientes WHERE usuario_id = $1',
                [usuarioId]
            );
            
            if (patientProfileResult.rowCount > 0) {
                const patientProfile = patientProfileResult.rows[0];
                user.alergias = patientProfile.alergias;
                user.grupo_sanguineo = patientProfile.tipo_sangre_id;
            }
        }
        
        res.json(user);

    } catch (error) {
        console.error('Error al obtener el perfil:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});


router.get('/pacientes', async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE rol_id = 5 ORDER BY nombres ASC');
    res.json(rows);
});

router.get('/pacientes/:id', async (req, res) => {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE id = $1 AND esta_activo = true', [id]);
    res.json(rows[0]);
});

router.post('/pacientes', async (req, res) => {
    try {
        const { nombres, apellidos, dni, email, password, telefono, fechaNacimiento, genero } = req.body;

        const existingUser = await pool.query(
            'SELECT * FROM usuarios WHERE email = $1 OR dni = $2',
            [email, dni]
        );

        if (existingUser.rowCount > 0) {
            if (existingUser.rows[0].email === email) {
                return res.status(409).json({ message: 'El correo electrónico ya está registrado.' });
            }
            if (existingUser.rows[0].dni === dni) {
                return res.status(409).json({ message: 'El DNI ya está registrado.' });
            }
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const { rows } = await pool.query(
            'INSERT INTO usuarios (email, password_hash, dni, nombres, apellidos, telefono, fecha_nacimiento, genero_id, rol_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 5) RETURNING id',
            [email, hashedPassword, dni, nombres, apellidos, telefono, fechaNacimiento, genero]
        );
        const usuarioId = rows[0].id;

        await pool.query(
            `INSERT INTO perfiles_pacientes (usuario_id) VALUES ($1)`,
            [usuarioId]
        );

        res.status(201).json({ message: "Paciente registrado correctamente", usuarioId });

    } catch (error) {
        console.error('Error en el registro de paciente:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

router.put('/perfil/actualizar', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'No estás autenticado.' });
    }
    const usuarioId = req.session.userId;

    const {
        nombres,
        apellidos,
        telefono,
        fecha_nacimiento,
        direccion,
        genero_id,
        email,
    } = req.body;

    const { tipo_sangre_id, alergias } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const updateUserQuery = `
            UPDATE usuarios 
            SET 
                nombres = $1, apellidos = $2, telefono = $3, 
                fecha_nacimiento = $4, direccion = $5, genero_id = $6, email = $7
            WHERE id = $8 RETURNING rol_id
        `;
        const userResult = await client.query(updateUserQuery, [
            nombres, apellidos, telefono,
            fecha_nacimiento || null, direccion,
            genero_id || null, email, usuarioId
        ]);

        if (userResult.rowCount === 0) {
            throw new Error('No se pudo encontrar el usuario para actualizar.');
        }

        const { rol_id } = userResult.rows[0];

        if (rol_id === 5) {
            const updatePatientProfileQuery = `
                UPDATE perfiles_pacientes
                SET alergias = $1, tipo_sangre_id = $2
                WHERE usuario_id = $3
            `;
            const dbTipoSangreId = tipo_sangre_id === "" ? null : tipo_sangre_id;
            await client.query(updatePatientProfileQuery, [alergias, dbTipoSangreId, usuarioId]);
        }
        
        await client.query('COMMIT');

        const updatedProfile = await client.query('SELECT * FROM usuarios WHERE id = $1', [usuarioId]);
        const finalProfile = updatedProfile.rows[0];
        delete finalProfile.password_hash;

        if (finalProfile.rol_id === 5) {
             const patientProfileResult = await client.query(
                'SELECT alergias, tipo_sangre_id FROM perfiles_pacientes WHERE usuario_id = $1',
                [usuarioId]
            );
            if (patientProfileResult.rowCount > 0) {
                finalProfile.alergias = patientProfileResult.rows[0].alergias;
                finalProfile.grupo_sanguineo = patientProfileResult.rows[0].tipo_sangre_id;
            }
        }
        
        res.status(200).json(finalProfile);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al actualizar el perfil:', error);
        res.status(500).json({ message: 'Error interno del servidor al actualizar el perfil.' });
    } finally {
        client.release();
    }
});

router.put('/perfil/cambiar-password', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'No estás autenticado.' });
    }

    const { password_actual, nueva_password } = req.body;
    const usuarioId = req.session.userId;

    if (!password_actual || !nueva_password) {
        return res.status(400).json({ message: 'Todos los campos son requeridos.' });
    }

    try {
        const result = await pool.query('SELECT password_hash FROM usuarios WHERE id = $1', [usuarioId]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }
        const storedHash = result.rows[0].password_hash;

        const isMatch = await bcrypt.compare(password_actual, storedHash);
        if (!isMatch) {
            return res.status(400).json({ message: 'La contraseña actual es incorrecta.' });
        }

        const salt = await bcrypt.genSalt(10);
        const newHashedPassword = await bcrypt.hash(nueva_password, salt);

        await pool.query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [newHashedPassword, usuarioId]);

        res.status(200).json({ message: 'Contraseña actualizada correctamente.' });

    } catch (error) {
        console.error('Error al cambiar la contraseña:', error);
        res.status(500).json({ message: 'Error interno del servidor al cambiar la contraseña.' });
    }
});

router.delete('/perfil/eliminar', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'No estás autenticado.' });
    }
    const usuarioId = req.session.userId;

    try {
        const updateQuery = 'UPDATE usuarios SET esta_activo = false WHERE id = $1';
        const { rowCount } = await pool.query(updateQuery, [usuarioId]);

        if (rowCount === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado para desactivar.' });
        }

        req.session.destroy(err => {
            if (err) {
                console.error('Error al destruir la sesión después de desactivar la cuenta:', err);
                return res.status(200).json({ message: 'Cuenta desactivada, pero hubo un error al cerrar la sesión.' });
            }
            res.clearCookie('connect.sid');
            return res.status(200).json({ message: 'Tu cuenta ha sido eliminada correctamente.' });
        });

    } catch (error) {
        console.error('Error al desactivar la cuenta:', error);
        res.status(500).json({ message: 'Error interno del servidor al intentar eliminar la cuenta.' });
    }
});

export default router;