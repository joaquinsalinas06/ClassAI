variable "project_id" {
  description = "ID del proyecto de GCP dedicado a ClassAI."
  type        = string
}

variable "region" {
  description = "Región de la red y del disco."
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "Zona de la VM dentro de la región elegida."
  type        = string
  default     = "us-central1-a"
}

variable "machine_type" {
  description = "Tamaño de VM; e2-medium ofrece 4 GiB para el stack sin voz."
  type        = string
  default     = "e2-medium"
}

variable "data_disk_gb" {
  description = "Disco estándar separado para los datos persistentes; no se formatea automáticamente."
  type        = number
  default     = 20
  validation {
    condition     = var.data_disk_gb >= 10
    error_message = "El disco de datos debe tener al menos 10 GB."
  }
}

variable "web_source_ranges" {
  description = "CIDR autorizados para HTTP/HTTPS; vacío mantiene la web cerrada."
  type        = list(string)
  default     = []
  validation {
    condition     = alltrue([for cidr in var.web_source_ranges : can(cidrhost(cidr, 0))])
    error_message = "Cada origen web debe ser un CIDR válido."
  }
}

variable "mqtt_source_ranges" {
  description = "CIDR autorizados para MQTT con TLS; vacío mantiene MQTT cerrado."
  type        = list(string)
  default     = []
  validation {
    condition     = alltrue([for cidr in var.mqtt_source_ranges : can(cidrhost(cidr, 0))])
    error_message = "Cada origen MQTT debe ser un CIDR válido."
  }
}
