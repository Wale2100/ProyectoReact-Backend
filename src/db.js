import { MongoClient } from 'mongodb';

// Configuración de conexión
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.DB_NAME || 'proyectoReact';

const client = new MongoClient(MONGO_URI);
let db;
let isConnected = false;

// Conectar a MongoDB
async function connectDB() {
  try {
    if (isConnected) {
      console.log('✅ Ya conectado a MongoDB');
      return;
    }

    await client.connect();
    db = client.db(DB_NAME);
    isConnected = true;
    
    console.log(`✅ Conectado a MongoDB - Base de datos: ${DB_NAME}`);
    
    // Verificar la conexión
    await db.admin().ping();
    console.log('✅ Ping exitoso a MongoDB');
    
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error);
    isConnected = false;
    throw error;
  }
}

// Función para cerrar la conexión
async function closeDB() {
  try {
    if (client) {
      await client.close();
      isConnected = false;
      console.log('✅ Conexión a MongoDB cerrada');
    }
  } catch (error) {
    console.error('❌ Error cerrando MongoDB:', error);
  }
}

// Función para verificar el estado de la conexión
function getConnectionStatus() {
  return {
    connected: isConnected,
    database: DB_NAME,
    uri: MONGO_URI.replace(/\/\/.*:.*@/, '//***:***@') // Ocultar credenciales
  };
}

// Exportar funciones y base de datos
export { connectDB, closeDB, getConnectionStatus, db };