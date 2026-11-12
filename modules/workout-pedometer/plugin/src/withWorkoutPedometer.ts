import {
  AndroidConfig,
  ConfigPlugin,
  createRunOncePlugin,
  withInfoPlist,
} from 'expo/config-plugins';

export interface WorkoutPedometerPluginProps {
  motionPermission?: string;
}

const DEFAULT_MOTION_USAGE =
  'Izinkan Walk The Talk mengakses aktivitas fisik untuk menghitung langkah dan rute Anda di latar belakang saat berolahraga.';

const withWorkoutPedometer: ConfigPlugin<WorkoutPedometerPluginProps | void> = (
  config,
  props
) => {
  const withIosMotion = withInfoPlist(config, (cfg) => {
    const existing = cfg.modResults.NSMotionUsageDescription;
    cfg.modResults.NSMotionUsageDescription =
      props?.motionPermission ??
      (typeof existing === 'string' && existing.length > 0 ? existing : DEFAULT_MOTION_USAGE);
    return cfg;
  });

  return AndroidConfig.Permissions.withPermissions(withIosMotion, [
    'android.permission.ACTIVITY_RECOGNITION',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_HEALTH',
    'android.permission.POST_NOTIFICATIONS',
  ]);
};

export default createRunOncePlugin(withWorkoutPedometer, 'workout-pedometer', '1.0.0');

