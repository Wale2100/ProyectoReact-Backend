# 🚂 DESPLIEGUE DEL BACKEND EN RAILWAY

## **📋 PASOS PARA DESPLEGAR:**

### **1. Crear cuenta y proyecto en Railway**
```
🔗 Ve a: https://railway.app
👤 Inicia sesión con GitHub
➕ New Project → Deploy from GitHub repo
📁 Selecciona: Wale2100/ProyectoReact-Backend
```

### **2. Configurar variables de entorno en Railway**
Una vez creado el proyecto, ve a **Variables** y agrega:

```bash
# Variables requeridas para Railway:
NODE_ENV=production
PORT=${{PORT}}  # Railway lo asigna automáticamente

# MongoDB Atlas (usa tus datos reales)
MONGODB_URI=mongodb+srv://TU-USUARIO:TU-CONTRASEÑA@TU-CLUSTER.mongodb.net/proyectoReact?retryWrites=true&w=majority

# Firebase
FIREBASE_PROJECT_ID=curso-react-auth-dede7
```

### **3. Subir credenciales de Firebase**
⚠️ **IMPORTANTE**: Necesitas subir el archivo `credenciales.json` de Firebase Admin SDK:

**Opción A: Variable de entorno (Recomendado)**
```bash
# En Railway Variables, crea:
FIREBASE_ADMIN_CREDENTIALS={"type":"service_account","project_id":"curso-react-auth-dede7",...}
```

**Opción B: Modificar el código para usar variables**
Editar `src/server.js` para cargar desde variables de entorno en lugar de archivo.

### **4. URLs importantes**
Después del despliegue tendrás:
```
🌐 URL del backend: https://tu-proyecto.railway.app
🏥 Health check: https://tu-proyecto.railway.app/health
📊 API: https://tu-proyecto.railway.app/api/articulo/nombre
```

---

## **🔧 CONFIGURACIÓN ACTUAL DEL BACKEND:**

✅ **Railway.json configurado**
✅ **Health check disponible en /health**
✅ **MongoDB Atlas conectado**
✅ **CORS habilitado**
✅ **Firebase Admin configurado**

---

## **📝 TAREAS POST-DESPLIEGUE:**

1. **Obtener URL del backend Railway**
2. **Actualizar .env.production del frontend**
3. **Redesplegar frontend con nueva URL**
4. **Probar conexión completa**

---

## **🚨 PROBLEMAS COMUNES Y SOLUCIONES:**

### **Error: Cannot find module 'credenciales.json'**
**Solución**: Crear variable de entorno con las credenciales o usar Firebase Admin via variables.

### **Error: Database connection failed**
**Solución**: Verificar MONGODB_URI y whitelist de IPs en MongoDB Atlas (agregar 0.0.0.0/0 para Railway).

### **Error: Port already in use**
**Solución**: Railway maneja el PORT automáticamente, asegurate de usar process.env.PORT.

---

🎯 **SIGUIENTE PASO**: Ve a https://railway.app y despliega tu backend siguiendo estos pasos.
