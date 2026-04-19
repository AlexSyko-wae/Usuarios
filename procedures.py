from db import get_connection

def crear_usuario(nombre, email, password, tipo):
    conexion = get_connection()
    cursor = conexion.cursor(dictionary=True)

    try:
        # Llamamos al procedimiento para crear usuario
        cursor.callproc("crearUsuario", [nombre, email, password, tipo])

        data = []
        # Capturamos el SELECT con el ID que retorna el SP
        for result in cursor.stored_results():
            data = result.fetchall()

        # ⚠️ IMPORTANTE: El SP hace INSERTs, por lo que el commit es obligatorio
        conexion.commit()

        if data:
            return {
                "success": True,
                "id": data[0]["id"]
            }
        else:
            return {
                "success": False,
                "error": "No se pudo obtener el ID del usuario creado"
            }

    except Exception as e:
        conexion.rollback()
        return {
            "success": False,
            "error": str(e)
        }

    finally:
        cursor.close()
        conexion.close()


def login_user(email, password):
    conexion = get_connection()
    cursor = conexion.cursor(dictionary=True)

    try:
        # Llamamos al procedimiento de login
        cursor.callproc("login", [email, password])

        user = []
        # Capturamos los datos del usuario que retorna el SP
        for result in cursor.stored_results():
            user = result.fetchall()

        # ⚠️ IMPORTANTE: aunque sea SELECT, tu SP hace UPDATE
        conexion.commit()

        if user:
            return {
                "success": True,
                "user": user[0]  # solo un usuario
            }
        else:
            return {
                "success": False,
                "error": "Credenciales incorrectas"
            }

    except Exception as e:
        conexion.rollback()
        return {
            "success": False,
            "error": str(e)
        }

    finally:
        cursor.close()
        conexion.close()



# --- USUARIOS ---

def logout(user_id):
    conexion = get_connection()
    cursor = conexion.cursor(dictionary=True)
    try:
        cursor.callproc("logout", [user_id])
        conexion.commit()
        return {"success": True}
    except Exception as e:
        conexion.rollback()
        return {"success": False, "error": str(e)}
    finally:
        cursor.close()
        conexion.close()

def actualizar_perfil(user_id, nombre, email, password=None):
    conexion = get_connection()
    cursor = conexion.cursor(dictionary=True)
    try:
        if password is not None and str(password).strip() != "":
            cursor.execute(
                "UPDATE Usuarios SET nombre = %s, email = %s, password = %s WHERE id = %s",
                (nombre, email, password, user_id)
            )
        else:
            cursor.execute(
                "UPDATE Usuarios SET nombre = %s, email = %s WHERE id = %s",
                (nombre, email, user_id)
            )
        conexion.commit()
        return {"success": True}
    except Exception as e:
        conexion.rollback()
        return {"success": False, "error": str(e)}
    finally:
        cursor.close()
        conexion.close()


def obtener_usuario(user_id):
    conexion = get_connection()
    cursor = conexion.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, nombre, email, tipo FROM Usuarios WHERE id = %s",
            (user_id,)
        )
        usuario = cursor.fetchone()
        if usuario:
            return {"success": True, "user": usuario}
        return {"success": False, "error": "Usuario no encontrado"}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        cursor.close()
        conexion.close()


def gestionar_usuarios():
    conexion = get_connection()
    cursor = conexion.cursor(dictionary=True)
    try:
        cursor.callproc("gestionarUsuarios")
        result = [r.fetchall() for r in cursor.stored_results()]
        return {"success": True, "data": result[0] if result else []}
    except Exception as e:
        # En consultas SELECT no hace falta rollback, pero no estorba
        return {"success": False, "error": str(e)}
    finally:
        cursor.close()
        conexion.close()

# --- EVENTOS ---

def crear_evento(titulo, fecha, ubicacion, capacidad, descripcion, categoria, org_id):
    conexion = get_connection()
    cursor = conexion.cursor(dictionary=True)
    try:
        cat = str(categoria).strip() if categoria is not None else ""
        cursor.callproc("crearEvento", [titulo, fecha, ubicacion, capacidad, descripcion, cat, org_id])
        conexion.commit()
        return {"success": True}
    except Exception as e:
        conexion.rollback()
        return {"success": False, "error": str(e)}
    finally:
        cursor.close()
        conexion.close()

def editar_evento(evento_id, titulo, fecha, ubicacion, capacidad, descripcion, categoria):
    conexion = get_connection()
    cursor = conexion.cursor(dictionary=True)
    try:
        # El SP editarEvento debe incluir SET categoria = p_categoria (ver peje_tickets.sql).
        cat = str(categoria).strip() if categoria is not None else ""
        cursor.callproc("editarEvento", [evento_id, titulo, fecha, ubicacion, capacidad, descripcion, cat])
        conexion.commit()
        return {"success": True}
    except Exception as e:
        conexion.rollback()
        return {"success": False, "error": str(e)}
    finally:
        cursor.close()
        conexion.close()

def eliminar_evento(evento_id):
    conexion = get_connection()
    cursor = conexion.cursor(dictionary=True)
    try:
        cursor.callproc("eliminarEvento", [evento_id])
        conexion.commit()
        return {"success": True}
    except Exception as e:
        conexion.rollback()
        return {"success": False, "error": str(e)}
    finally:
        cursor.close()
        conexion.close()

def obtener_detalles_evento(evento_id):
    conexion = get_connection()
    cursor = conexion.cursor(dictionary=True)
    try:
        cursor.callproc("obtenerDetalles", [evento_id])
        result = [r.fetchall() for r in cursor.stored_results()]
        # Retornamos el primer elemento directamente porque es un solo evento
        return {"success": True, "data": result[0][0] if result and result[0] else None}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        cursor.close()
        conexion.close()


def obtener_eventos_disponibles():
    conexion = get_connection()
    cursor = conexion.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT e.*, \
"
            "       COALESCE(SUM(b.estado = 'Disponible'), 0) AS disponibles, \
"
            "       COALESCE(SUM(b.estado = 'Vendido'), 0) AS vendidos, \
"
            "       COALESCE(MIN(b.precio), 0) AS precio_minimo, \
"
            "       COUNT(b.id) AS boletos_totales \n"
            "FROM Eventos e \n"
            "LEFT JOIN Boletos b ON b.evento_id = e.id \n"
            "GROUP BY e.id"
        )
        rows = cursor.fetchall()
        return {"success": True, "data": rows}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        cursor.close()
        conexion.close()


def comprar_boleto(usuario_id, evento_id, cantidad=1, metodo='Tarjeta'):
    conexion = get_connection()
    cursor = conexion.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, precio FROM Boletos WHERE evento_id = %s AND estado = 'Disponible' LIMIT %s",
            (evento_id, cantidad)
        )
        boletos = cursor.fetchall()
        if not boletos or len(boletos) < cantidad:
            return {"success": False, "error": "No hay suficientes boletos disponibles."}

        total = sum(float(boleto["precio"] or 0) for boleto in boletos)
        cursor.execute(
            "INSERT INTO Ordenes (usuario_id, total, estado) VALUES (%s, %s, 'Confirmada')",
            (usuario_id, total)
        )
        orden_id = cursor.lastrowid

        boleto_ids = [boleto["id"] for boleto in boletos]
        placeholders = ",".join(["%s"] * len(boleto_ids))
        cursor.execute(
            f"UPDATE Boletos SET orden_id = %s, estado = 'Vendido' WHERE id IN ({placeholders})",
            tuple([orden_id] + boleto_ids)
        )

        cursor.execute(
            "INSERT INTO Pagos (orden_id, monto, metodo, estado, fechaPago, referenciaTransaccion) VALUES (%s, %s, %s, 'Completado', NOW(), UUID())",
            (orden_id, total, metodo)
        )

        conexion.commit()
        return {"success": True, "order_id": orden_id, "boleto_ids": boleto_ids, "total": total}
    except Exception as e:
        conexion.rollback()
        return {"success": False, "error": str(e)}
    finally:
        cursor.close()
        conexion.close()


def obtener_ordenes_usuario(usuario_id):
    conexion = get_connection()
    cursor = conexion.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT o.id, o.total, o.estado, o.fecha, e.titulo AS evento, COUNT(b.id) AS cantidad "
            "FROM Ordenes o "
            "JOIN Boletos b ON b.orden_id = o.id "
            "JOIN Eventos e ON e.id = b.evento_id "
            "WHERE o.usuario_id = %s "
            "GROUP BY o.id, e.titulo, o.total, o.estado, o.fecha "
            "ORDER BY o.fecha DESC",
            (usuario_id,)
        )
        filas = cursor.fetchall()
        return {"success": True, "data": filas}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        cursor.close()
        conexion.close()

# --- REPORTES Y NOTIFICACIONES ---

def generar_reporte_ventas(evento_id):
    conexion = get_connection()
    cursor = conexion.cursor(dictionary=True)
    try:
        cursor.callproc("generarReportVentas", [evento_id])
        result = [r.fetchall() for r in cursor.stored_results()]
        return {"success": True, "data": result[0] if result else []}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        cursor.close()
        conexion.close()

def enviar_notificacion(usuario_id, mensaje):
    conexion = get_connection()
    cursor = conexion.cursor(dictionary=True)
    try:
        cursor.callproc("enviarNotificacion", [usuario_id, mensaje])
        conexion.commit()
        return {"success": True}
    except Exception as e:
        conexion.rollback()
        return {"success": False, "error": str(e)}
    finally:
        cursor.close()
        conexion.close()


def supervisar_eventos():
    conexion = get_connection()
    cursor = conexion.cursor(dictionary=True)
    try:
        cursor.callproc("supervisarEventos", [])
        result = [r.fetchall() for r in cursor.stored_results()]
        rows = result[0] if result else []
        return {"success": True, "data": rows}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        cursor.close()
        conexion.close()

# nuevos procedimientos aÑadindo 

def administrar_boletos(evento_id):
    conexion = get_connection()
    cursor = conexion.cursor(dictionary=True)
    try:
        cursor.callproc("administrarBoletos", [evento_id])
        result = [r.fetchall() for r in cursor.stored_results()]
        rows = result[0] if result else []
        return {"success": True, "data": rows}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        cursor.close()
        conexion.close()

def consultar_ventas(organizador_id):
    conexion = get_connection()
    cursor = conexion.cursor(dictionary=True)
    try:
        cursor.callproc("consultarVentas", [organizador_id])
        result = [r.fetchall() for r in cursor.stored_results()]
        rows = result[0] if result else []
        return {"success": True, "data": rows}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        cursor.close()
        conexion.close()

def validar_qr(codigo_qr):
    conexion = get_connection()
    cursor = conexion.cursor(dictionary=True)
    try:
        cursor.callproc("validarQR", [codigo_qr])
        result = [r.fetchall() for r in cursor.stored_results()]
        rows = result[0] if result else []
        return {"success": True, "data": rows}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        cursor.close()
        conexion.close()

        # Para Reportes e Impresión (Ambos Roles)

def generar_reporte_pagos():
    conexion = get_connection()
    cursor = conexion.cursor(dictionary=True)
    try:
        cursor.callproc("generarReportPagos", [])
        result = [r.fetchall() for r in cursor.stored_results()]
        rows = result[0] if result else []
        return {"success": True, "data": rows}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        cursor.close()
        conexion.close()

def exportar_pdf(reporte_id):
    conexion = get_connection()
    cursor = conexion.cursor(dictionary=True)
    try:
        cursor.callproc("exportarPDF", [reporte_id])
        result = [r.fetchall() for r in cursor.stored_results()]
        rows = result[0] if result else []
        return {"success": True, "data": rows}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        cursor.close()
        conexion.close()

def generar_reporte_asistencia(evento_id):
    conexion = get_connection()
    cursor = conexion.cursor(dictionary=True)
    try:
        cursor.callproc("generarReportAsistencia", [evento_id])
        result = [r.fetchall() for r in cursor.stored_results()]
        rows = result[0] if result else []
        return {"success": True, "data": rows}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        cursor.close()
        conexion.close()

#Procedimientos de Acción 
def actualizar_estado(evento_id, nuevo_estado):
    conexion = get_connection()
    cursor = conexion.cursor(dictionary=True)
    try:
        cursor.callproc("actualizarEstado", [evento_id, nuevo_estado])
        #  IMPORTANTE: Modifica datos, el commit es obligatorio
        conexion.commit()
        return {"success": True}
    except Exception as e:
        conexion.rollback()
        return {"success": False, "error": str(e)}
    finally:
        cursor.close()
        conexion.close()

def generar_boletos(evento_id, precio):
    conexion = get_connection()
    cursor = conexion.cursor(dictionary=True)
    try:
        cursor.callproc("generarBoletos", [evento_id, precio])
        #  IMPORTANTE: Inserta los boletos, el commit es obligatorio
        conexion.commit()
        return {"success": True}
    except Exception as e:
        conexion.rollback()
        return {"success": False, "error": str(e)}
    finally:
        cursor.close()
        conexion.close()

def marcar_usado(boleto_id):
    conexion = get_connection()
    cursor = conexion.cursor(dictionary=True)
    try:
        cursor.callproc("marcarUsado", [boleto_id])
        #IMPORTANTE: Modifica datos, el commit es obligatorio
        conexion.commit()
        return {"success": True}
    except Exception as e:
        conexion.rollback()
        return {"success": False, "error": str(e)}
    finally:
        cursor.close()
        conexion.close()

def generar_reportes(tipo):
    conexion = get_connection()
    cursor = conexion.cursor(dictionary=True)
    try:
        cursor.callproc("generarReportes", [tipo])

        conexion.commit()
        return {"success": True}
    except Exception as e:
        conexion.rollback()
        return {"success": False, "error": str(e)}
    finally:
        cursor.close()
        conexion.close()
