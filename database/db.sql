CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION actualizar_fecha_modificacion()
RETURNS TRIGGER AS $$
BEGIN
  NEW.fecha_modificacion = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE generos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE tipo_sangre (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE titulos_profesionales (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE especialidades (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE estados_cita (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE
);


CREATE TABLE informacion_clinica (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    direccion TEXT NOT NULL,
    telefono VARCHAR(50) NOT NULL,
    email_contacto VARCHAR(255) NOT NULL,
    sitio_web VARCHAR(512),
    url_logo VARCHAR(512),
    numero_fiscal VARCHAR(50)
);

CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    dni VARCHAR(50) NOT NULL UNIQUE,
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    telefono VARCHAR(50),
    fecha_nacimiento DATE,
    direccion TEXT,
    url_foto_perfil VARCHAR(512),
    genero_id INT REFERENCES generos(id),
    rol_id INT NOT NULL REFERENCES roles(id),
    esta_activo BOOLEAN NOT NULL DEFAULT true,
    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_modificacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE perfiles_doctores (
    usuario_id UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
    numero_colegiatura VARCHAR(100) NOT NULL UNIQUE,
    biografia TEXT,
    titulo_profesional_id INT NOT NULL REFERENCES titulos_profesionales(id)
);

CREATE TABLE perfiles_pacientes (
    usuario_id UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
    alergias TEXT,
    tipo_sangre_id INT REFERENCES tipo_sangre(id)
);

CREATE TABLE doctores_especialidades (
    doctor_usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    especialidad_id INT NOT NULL REFERENCES especialidades(id) ON DELETE CASCADE,
    PRIMARY KEY (doctor_usuario_id, especialidad_id)
);

CREATE TABLE horarios_doctores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    duracion_cita_minutos SMALLINT NOT NULL DEFAULT 30,
    CHECK (hora_fin > hora_inicio)
);

CREATE TABLE excepciones_horarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    fecha_excepcion DATE NOT NULL,
    esta_disponible BOOLEAN NOT NULL DEFAULT false,
    hora_inicio TIME,
    hora_fin TIME,
    UNIQUE(doctor_usuario_id, fecha_excepcion)
);

CREATE TABLE citas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    doctor_usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    fecha_hora_inicio TIMESTAMPTZ NOT NULL,
    fecha_hora_fin TIMESTAMPTZ NOT NULL,
    estado_cita_id INT NOT NULL REFERENCES estados_cita(id),
    motivo_consulta TEXT,
    UNIQUE (doctor_usuario_id, fecha_hora_inicio)
);

CREATE TABLE historiales_medicos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cita_id UUID NOT NULL UNIQUE REFERENCES citas(id) ON DELETE RESTRICT,
    paciente_usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    diagnostico TEXT,
    receta_medica TEXT,
    notas_doctor TEXT,
    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_modificacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notificaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    mensaje TEXT NOT NULL,
    leida BOOLEAN NOT NULL DEFAULT false,
    enlace_relacionado VARCHAR(512),
    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER actualizar_fecha_mod_usuarios
BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE PROCEDURE actualizar_fecha_modificacion();

CREATE TRIGGER actualizar_fecha_mod_historiales
BEFORE UPDATE ON historiales_medicos FOR EACH ROW EXECUTE PROCEDURE actualizar_fecha_modificacion();

CREATE INDEX idx_usuarios_rol_id ON usuarios(rol_id);
CREATE INDEX idx_citas_paciente_id ON citas(paciente_usuario_id);
CREATE INDEX idx_citas_doctor_id_fecha ON citas(doctor_usuario_id, fecha_hora_inicio);
CREATE INDEX idx_historiales_medicos_paciente_id ON historiales_medicos(paciente_usuario_id);
CREATE INDEX idx_notificaciones_usuario_id ON notificaciones(usuario_id);


--------------------------------------------


INSERT INTO roles (nombre) VALUES
('Super Administrador'),
('Administrador'),
('Doctor'),
('Recepcionista'),
('Paciente');

INSERT INTO estados_cita (nombre) VALUES
('Programada'),
('Confirmada'),
('Completada'),
('Cancelada'),
('Ausente');


INSERT INTO generos (nombre) VALUES
('Masculino'),
('Femenino'),
('Prefiero no decirlo');


INSERT INTO tipo_sangre (nombre) VALUES
('A+'),
('A-'),
('B+'),
('B-'),
('AB+'),
('AB-'),
('O+'),
('O-');


INSERT INTO especialidades (nombre) VALUES
('Cardiología'),
('Dermatología'),
('Pediatría'),
('Ginecología y Obstetricia'),
('Medicina General'),
('Oftalmología'),
('Traumatología'),
('Psicología');


INSERT INTO titulos_profesionales (nombre) VALUES
('Médico Cirujano'),
('Licenciado en Psicología'),
('Licenciado en Obstetricia'),
('Médico Especialista en Cardiología'),
('Médico Especialista en Dermatología');


--------------------------------------------------------------

