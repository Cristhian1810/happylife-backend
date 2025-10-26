import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

router.get('/clinica/info', async (req, res) => {
    try {
        const { rows } = await pool.query("SELECT * FROM informacion_clinica LIMIT 1");

        if (rows.length === 0) {
            return res.json({
                isNew: true,
                nombre: '',
                direccion: '',
                telefono: '',
                email_contacto: '',
                sitio_web: '',
                url_logo: '',
                numero_fiscal: ''
            });
        }
        
        res.json(rows[0]);
    } catch (error) {
        console.error("Error al obtener la información de la clínica:", error);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

router.post('/clinica/info', async (req, res) => {
    const { nombre, direccion, telefono, email_contacto, sitio_web, url_logo, numero_fiscal } = req.body;

    if (!nombre || !direccion || !telefono || !email_contacto) {
        return res.status(400).json({ message: "Los campos nombre, dirección, teléfono y email son obligatorios." });
    }

    try {
        const existingInfo = await pool.query("SELECT id FROM informacion_clinica LIMIT 1");

        let result;
        if (existingInfo.rows.length > 0) {
            const clinicId = existingInfo.rows[0].id;
            const query = `
                UPDATE informacion_clinica 
                SET nombre = $1, direccion = $2, telefono = $3, email_contacto = $4, sitio_web = $5, url_logo = $6, numero_fiscal = $7
                WHERE id = $8
                RETURNING *;
            `;
            result = await pool.query(query, [nombre, direccion, telefono, email_contacto, sitio_web, url_logo, numero_fiscal, clinicId]);
        } else {
            const query = `
                INSERT INTO informacion_clinica (nombre, direccion, telefono, email_contacto, sitio_web, url_logo, numero_fiscal)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *;
            `;
            result = await pool.query(query, [nombre, direccion, telefono, email_contacto, sitio_web, url_logo, numero_fiscal]);
        }

        res.status(200).json({ 
            message: "Información de la clínica guardada correctamente.",
            data: result.rows[0]
        });

    } catch (error) {
        console.error("Error al guardar la información de la clínica:", error);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

export default router;