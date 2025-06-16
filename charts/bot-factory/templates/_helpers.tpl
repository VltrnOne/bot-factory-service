{{/* Generate base name */}}
{{- define "bot-factory.name" -}}
{{- .Chart.Name -}}
{{- end -}}

{{/* Generate full release name */}}
{{- define "bot-factory.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
