output "vm_name" {
  value = google_compute_instance.classai.name
}

output "external_ip" {
  description = "IPv4 efímera; puede cambiar al detener y volver a arrancar la VM."
  value       = google_compute_instance.classai.network_interface[0].access_config[0].nat_ip
}

output "data_disk_name" {
  value = google_compute_disk.data.name
}
