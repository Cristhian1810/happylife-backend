import express from 'express';
import session from 'express-session';
import { PORT } from './config.js';
import pacientesRoutes from './routes/pacientes.routes.js';
import administradoresRoutes from './routes/administradores.routes.js';
import authRoutes from './routes/auth.routes.js';
import doctoresRoutes from './routes/doctores.routes.js';
import recepcionistaRoutes from './routes/recepcionistas.routes.js';
import catalogosRoutes from './routes/catalogos.routes.js';
import morgan from 'morgan';
import cors from 'cors';

const app = express();

const isProduction = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);

app.get('/favicon.ico', (req, res) => res.status(204));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: 1000 * 60 * 60 * 24
    }
}));

app.use(cors({
    origin: 'http://127.0.0.1:5500',
    credentials: true
}));

app.use(morgan('dev'));
app.use(express.json());

app.use(pacientesRoutes);
app.use(administradoresRoutes);
app.use(authRoutes);
app.use(catalogosRoutes);
app.use(doctoresRoutes);
app.use(recepcionistaRoutes);

app.listen(PORT, () => {
    console.log('Server on port', PORT);
});