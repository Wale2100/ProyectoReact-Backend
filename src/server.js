import express from 'express';
import { connectDB, closeDB, getConnectionStatus, db } from './db.js';
import fs from 'fs';
import admin from 'firebase-admin';
import cors from 'cors';
import 'dotenv/config';


// Cargar credenciales de Firebase usando path absoluto
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const credencialesPath = path.join(__dirname, '..', 'credenciales.json');

const credenciales = JSON.parse(fs.readFileSync(credencialesPath, 'utf-8'));

admin.initializeApp({
  credential: admin.credential.cert(credenciales)
});

const app = express();
const PORT = process.env.PORT || 8001;

// Configurar CORS
app.use(cors());

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Middleware de logging simple
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Middleware de autenticación OPCIONAL (no bloquea rutas públicas)
app.use(async (req, res, next) => {
  const { authtoken } = req.headers;
  
  // Si hay token, intentar validarlo
  if (authtoken) {
    try {
      const decodedToken = await admin.auth().verifyIdToken(authtoken);
      req.user = decodedToken;
      console.log(`✅ Usuario autenticado: ${decodedToken.email || decodedToken.uid}`);
    } catch (error) {
      console.error('⚠️ Token inválido:', error.message);
      // No bloqueamos la request, solo no asignamos usuario
      req.user = null;
    }
  } else {
    // Sin token = usuario no autenticado (permitido)
    req.user = null;
  }
  
  next();
});

// Middleware para verificar conexión a DB
app.use('/api', (req, res, next) => {
  if (!getConnectionStatus().connected) {
    return res.status(503).json({ 
      mensaje: 'Servicio no disponible - Error de base de datos' 
    });
  }
  next();
});

// Endpoint de salud del servidor
app.get('/health', (req, res) => {
  const dbStatus = getConnectionStatus();
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    uptime: process.uptime()
  });
});

// Endpoint para comentarios (solo uno por usuario)
app.post('/api/votar/:nombre/comentario', async (req, res) => {
  try {
    const { nombre } = req.params;
    const { autor, texto, userId } = req.body;
    
    // Validaciones
    if (!autor?.trim() || !texto?.trim() || !userId) {
      return res.status(400).json({ 
        mensaje: 'Se requieren autor, texto y userId para el comentario',
        campos_requeridos: ['autor', 'texto', 'userId']
      });
    }

    // Validar longitud
    if (autor.length > 50 || texto.length > 500) {
      return res.status(400).json({ 
        mensaje: 'Autor máximo 50 caracteres, texto máximo 500 caracteres' 
      });
    }
    
    const articulo = await db.collection('articulos').findOne({ nombre });
    
    if (!articulo) {
      return res.status(404).json({ mensaje: 'Artículo no encontrado' });
    }

    // Verificar si el usuario ya comentó
    const comentarios = articulo.comentario || [];
    const yaComento = comentarios.some(comentario => comentario.userId === userId);
    
    if (yaComento) {
      return res.status(409).json({ 
        mensaje: 'Ya has comentado en este artículo',
        timestamp: new Date().toISOString()
      });
    }

    const nuevoComentario = {
      id: new Date().getTime(),
      autor: autor.trim(),
      texto: texto.trim(),
      userId: userId,
      fecha: new Date(),
      ip: req.ip
    };const resultado = await db.collection('articulos').updateOne(
      { nombre },
      { 
        $push: { comentario: nuevoComentario },
        $set: { ultimaActualizacion: new Date() }
      }
    );

    console.log('Resultado de la actualización:', resultado);

    // ✅ Validar que la actualización fue exitosa
    if (!resultado || resultado.matchedCount === 0) {
      return res.status(404).json({ 
        mensaje: 'Artículo no encontrado para actualizar',
        timestamp: new Date().toISOString()
      });
    }

    if (resultado.modifiedCount === 0) {
      return res.status(500).json({ 
        mensaje: 'No se pudo agregar el comentario',
        timestamp: new Date().toISOString()
      });
    }
    
    res.status(201).json({
      mensaje: `Comentario registrado para ${nombre}`,
      comentario: nuevoComentario,
      articulo: nombre,
      resultado: {
        matched: resultado.matchedCount,
        modified: resultado.modifiedCount
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error al agregar comentario:', error);
    res.status(500).json({ 
      mensaje: 'Error interno del servidor',
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para obtener información completa de un artículo específico
app.get('/api/articulo/:nombre', async (req, res) => {
  try {
    const { nombre } = req.params;
    
    const articulo = await db.collection('articulos').findOne({ nombre });
    
    if (!articulo) {
      return res.status(404).json({ mensaje: 'Artículo no encontrado' });
    }    res.json({
      mensaje: `Información del artículo ${nombre}`,
      articulo: {
        nombre: articulo.nombre,
        titulo: articulo.titulo,
        img: articulo.img,
        contenido: articulo.contenido,
        voto: articulo.voto || 0,
        comentarios: articulo.comentario || [],
        totalComentarios: (articulo.comentario || []).length,
        ultimaActualizacion: articulo.ultimaActualizacion,
        fechaCreacion: articulo.fechaCreacion
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error al obtener artículo:', error);
    res.status(500).json({ 
      mensaje: 'Error interno del servidor',
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para obtener comentarios de un artículo específico
app.get('/api/votar/:nombre/comentario', async (req, res) => {
  try {
    const { nombre } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const articulo = await db.collection('articulos').findOne({ nombre });
    
    if (!articulo) {
      return res.status(404).json({ mensaje: 'Artículo no encontrado' });
    }

    // Obtener comentarios paginados y ordenados por fecha
    const comentarios = articulo.comentario || [];
    const comentariosOrdenados = comentarios
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
      .slice(skip, skip + parseInt(limit));
    
    res.json({
      mensaje: `Comentarios del artículo ${nombre}`,
      articulo: nombre,
      comentarios: comentariosOrdenados,
      paginacion: {
        total: comentarios.length,
        pagina: parseInt(page),
        limite: parseInt(limit),
        totalPaginas: Math.ceil(comentarios.length / parseInt(limit))
      },
      estadisticas: {
        totalComentarios: comentarios.length,
        totalVotos: articulo.voto || 0,
        ultimaActualizacion: articulo.ultimaActualizacion
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error al obtener comentarios:', error);
    res.status(500).json({ 
      mensaje: 'Error interno del servidor',
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para votos (solo una vez por usuario)
app.put('/api/votar/:nombre/masuno', async (req, res) => {
  try {
    const { nombre } = req.params;
    const { userId } = req.body; // Recibir ID del usuario desde frontend
    
    if (!userId) {
      return res.status(400).json({ 
        mensaje: 'Se requiere ID de usuario para votar',
        timestamp: new Date().toISOString()
      });
    }

    // Verificar si el usuario ya votó
    const articulo = await db.collection('articulos').findOne({ nombre });
    
    if (!articulo) {
      return res.status(404).json({ mensaje: 'Artículo no encontrado' });
    }

    // Verificar si el usuario ya votó
    if (articulo.usuariosQueVotaron && articulo.usuariosQueVotaron.includes(userId)) {
      return res.status(409).json({ 
        mensaje: 'Ya has votado por este artículo',
        timestamp: new Date().toISOString()
      });
    }
    
    const resultado = await db.collection('articulos').findOneAndUpdate(
      { nombre },
      { 
        $inc: { voto: 1 },
        $addToSet: { usuariosQueVotaron: userId }, // Agregar usuario a la lista
        $set: { ultimaActualizacion: new Date() }
      },
      { returnDocument: 'after' }
    );
    
    res.json({
      mensaje: `Voto registrado para ${nombre}`,
      totalVotos: resultado.voto,
      articulo: nombre,
      yaVotaste: true,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error al registrar voto:', error);
    res.status(500).json({ 
      mensaje: 'Error interno del servidor',
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para obtener votos
app.get('/api/votos', async (req, res) => {
  try {
    const { page = 1, limit = 10, sortBy = 'nombre' } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [articulos, total] = await Promise.all([
      db.collection('articulos')
        .find({})
        .sort({ [sortBy]: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray(),
      db.collection('articulos').countDocuments({})
    ]);
    
    res.json({
      mensaje: 'Artículos obtenidos desde MongoDB',
      datos: articulos,
      paginacion: {
        total,
        pagina: parseInt(page),
        limite: parseInt(limit),
        totalPaginas: Math.ceil(total / parseInt(limit))
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error al obtener votos:', error);
    res.status(500).json({ 
      mensaje: 'Error interno del servidor',
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para estadísticas
app.get('/api/estadisticas', async (req, res) => {
  try {
    const stats = await db.collection('articulos').aggregate([
      {
        $group: {
          _id: null,
          totalVotos: { $sum: '$voto' },
          totalArticulos: { $sum: 1 },
          promedioVotos: { $avg: '$voto' },
          totalComentarios: { $sum: { $size: '$comentario' } }
        }
      }
    ]).toArray();

    res.json({
      mensaje: 'Estadísticas del sistema',
      estadisticas: stats[0] || {},
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({ 
      mensaje: 'Error interno del servidor',
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint de prueba para verificar conexión y datos
app.get('/api/test-comentario/:nombre', async (req, res) => {
  try {
    const { nombre } = req.params;
    
    // Verificar que el artículo existe
    const articulo = await db.collection('articulos').findOne({ nombre });
    
    if (!articulo) {
      return res.json({ 
        error: 'Artículo no encontrado',
        nombre,
        articulosDisponibles: await db.collection('articulos').find({}, { projection: { nombre: 1 } }).toArray()
      });
    }
    
    res.json({
      mensaje: 'Artículo encontrado',
      articulo: {
        nombre: articulo.nombre,
        comentarios: articulo.comentario || [],
        totalComentarios: (articulo.comentario || []).length
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para verificar el estado del usuario (si ya votó o comentó)
app.get('/api/articulo/:nombre/estado-usuario/:userId', async (req, res) => {
  try {
    const { nombre, userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ 
        mensaje: 'Se requiere ID de usuario',
        timestamp: new Date().toISOString()
      });
    }
    
    const articulo = await db.collection('articulos').findOne({ nombre });
    
    if (!articulo) {
      return res.status(404).json({ mensaje: 'Artículo no encontrado' });
    }

    // Verificar si ya votó
    const yaVoto = articulo.usuariosQueVotaron && articulo.usuariosQueVotaron.includes(userId);
    
    // Verificar si ya comentó
    const yaComento = articulo.comentario && articulo.comentario.some(c => c.userId === userId);
    
    res.json({
      mensaje: `Estado del usuario para ${nombre}`,
      articulo: nombre,
      userId: userId,
      yaVoto: yaVoto,
      yaComento: yaComento,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error al verificar estado del usuario:', error);
    res.status(500).json({ 
      mensaje: 'Error interno del servidor',
      timestamp: new Date().toISOString()
    });
  }
});

// Manejo de errores 404
app.all('*', (req, res) => {
  res.status(404).json({ 
    mensaje: 'Endpoint no encontrado',
    path: req.originalUrl,
    method: req.method
  });
});

// Manejo graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Cerrando servidor...');
  await closeDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Cerrando servidor...');
  await closeDB();
  process.exit(0);
});

// Iniciar servidor con manejo de errores
async function startServer() {
  try {
    console.log('🔄 Iniciando conexión a MongoDB...');
    
    await connectDB();
    
    console.log('🔄 Iniciando servidor Express...');
    app.listen(PORT, () => {
      console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
      console.log(`📊 Salud del servidor: http://localhost:${PORT}/health`);
      console.log(`🔗 API endpoints: http://localhost:${PORT}/api/votos`);
    });
    
  } catch (error) {
    console.error('❌ Error fatal al iniciar:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Iniciar la aplicación
startServer();