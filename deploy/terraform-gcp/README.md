# Base GCP para ClassAI

Terraform prepara una única VM de Compute Engine en un proyecto elegido por el
operador: red dedicada, acceso SSH mediante IAP/OS Login, IPv4 efímera y disco de
datos separado. No instala ni inicia la aplicación, no copia credenciales y deja
HTTP, HTTPS y MQTT cerrados por defecto. Crear la VM genera cargos; no ejecutar
`apply` sin revisar el plan y la cuenta de facturación del proyecto.

El valor inicial es `e2-medium` (4 GiB RAM) con un disco de arranque estándar de
20 GB y uno de datos de 20 GB. Es una estimación de capacidad para el stack sin
voz, no una medición de carga. El disco de datos se entrega **sin formatear ni
montar**. Antes de instalar el stack, identificar el dispositivo por `device_name`
y comprobar que está vacío; nunca formatear un disco con datos. Montarlo de forma
persistente y ubicar allí los volúmenes de Docker, con respaldo y restauración
probados. La regla `prevent_destroy` evita un borrado accidental mediante Terraform,
pero no es respaldo y deja el disco facturable si se retira la VM.

## Antes de aplicar

1. Crear un proyecto exclusivo, vincular la cuenta de facturación deseada y verificar
   créditos/cuotas; habilitar Compute Engine e Identity-Aware Proxy en ese proyecto.
2. Autorizar al operador mediante IAM para crear los recursos y entrar con IAP y
   OS Login. No se modifica el IAM del proyecto en este módulo.
3. Desde esta carpeta, ejecutar `terraform init`, copiar `terraform.tfvars.example`
   a `terraform.tfvars`, poner el ID de proyecto y ejecutar `terraform plan`. Revisar
   los recursos y costos; solo después ejecutar `terraform apply` conscientemente.
4. Consultar el nombre y dirección con `terraform output`. La IP es efímera y puede
   cambiar al parar o volver a crear la VM; un cambio obliga a revisar DNS, MQTT y
   el endpoint compilado en Android. No se asigna IP estática automáticamente.

El estado Terraform es local por defecto: trátalo como información privada y haz
copia segura. Para colaboración, configurar un backend remoto con bloqueo y acceso
restringido antes de aplicar; nunca subir el estado ni `terraform.tfvars` al repo.

## Preparar la demo después de crear la VM

La VM por sí sola **no es un servidor ClassAI operativo**. Falta instalar Docker y
Compose, desplegar el commit elegido de `deploy/`, montar la persistencia, configurar
un nombre HTTPS y MQTT TLS, generar credenciales privadas, limitar acceso, validar
que la API confía únicamente en el proxy correspondiente para reconocer HTTPS,
y realizar pruebas físicas. El panel docente actual y las rutas de lectura no tienen
autenticación adecuada para datos personales públicos; protegerlas antes de abrir
la web. No habilitar MQTT público sin credenciales, ACL y TLS verificados.

Cuando esté listo, abrir solo los CIDR necesarios mediante `web_source_ranges` y
`mqtt_source_ranges`; aplicar y comprobar los firewalls. HTTPS requiere certificado
confiable por Android. Sin dominio propio existen certificados para IP y opciones de
DNS temporal, pero su compatibilidad y renovación deben validarse antes de elegir.
Cambiar la configuración de red no inicia servicios ni configura TLS.

Para SSH, tras autorizar IAP/OS Login: `gcloud compute ssh classai-demo --project=ID
--zone=us-central1-a --tunnel-through-iap`. No se abre SSH a Internet.
