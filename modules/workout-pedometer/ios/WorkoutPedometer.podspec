require 'json'

Pod::Spec.new do |s|
  s.name           = 'WorkoutPedometer'
  s.version        = '1.0.0'
  s.summary        = 'Background-capable step counter module for Walk The Talk'
  s.description    = 'Local Expo native module wrapping CoreMotion CMPedometer with interval reconciliation.'
  s.license        = 'MIT'
  s.author         = 'Walk The Talk'
  s.homepage       = 'https://expo.dev'
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.exclude_files = "Tests/**"
end

