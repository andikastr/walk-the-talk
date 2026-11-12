"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_plugins_1 = require("expo/config-plugins");
const DEFAULT_MOTION_USAGE = 'Izinkan Walk The Talk mengakses aktivitas fisik untuk menghitung langkah dan rute Anda di latar belakang saat berolahraga.';
const withWorkoutPedometer = (config, props) => {
    const withIosMotion = (0, config_plugins_1.withInfoPlist)(config, (cfg) => {
        const existing = cfg.modResults.NSMotionUsageDescription;
        cfg.modResults.NSMotionUsageDescription =
            props?.motionPermission ??
                (typeof existing === 'string' && existing.length > 0 ? existing : DEFAULT_MOTION_USAGE);
        return cfg;
    });
    return config_plugins_1.AndroidConfig.Permissions.withPermissions(withIosMotion, [
        'android.permission.ACTIVITY_RECOGNITION',
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_HEALTH',
        'android.permission.POST_NOTIFICATIONS',
    ]);
};
exports.default = (0, config_plugins_1.createRunOncePlugin)(withWorkoutPedometer, 'workout-pedometer', '1.0.0');
