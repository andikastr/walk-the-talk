import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, WebViewMessageEvent, WebViewProps } from 'react-native-webview';
import { LocateFixed, Map } from 'lucide-react-native';
import { GPSCoordinate } from '@/types/workout';
import { PALETTE, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/Colors';
import { MAP_CONFIG } from '@/constants/Config';

interface WorkoutMapProps {
  currentLocation: { latitude: number; longitude: number } | null;
  routeCoordinates: GPSCoordinate[];
  isTracking?: boolean;
}

const DEFAULT_COORD = { latitude: -6.2088, longitude: 106.8456 };

function buildLeafletHtml(
  initialLat: number,
  initialLng: number,
  hasInitialCoord: boolean,
  cartoApiKey: string
): string {
  const zoom = hasInitialCoord ? 16 : 12;
  const trimmedKey = cartoApiKey.trim();
  const hasCartoKey = trimmedKey.length > 0;
  const cartoTileUrl = hasCartoKey
    ? `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(trimmedKey)}`
    : '';
  const osmTileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const attributionHtml = hasCartoKey
    ? '&copy; OpenStreetMap &copy; CARTO'
    : '&copy; OpenStreetMap';

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    * { box-sizing: border-box; }
    html, body, #map {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: ${PALETTE.surfaceAlt};
      overflow: hidden;
      -webkit-tap-highlight-color: transparent;
    }
    .leaflet-control-attribution {
      font-family: sans-serif;
      font-size: 9px !important;
      background: rgba(244, 242, 236, 0.85) !important;
      color: ${PALETTE.onSurfaceVariant} !important;
      padding: 2px 6px !important;
      border-top-right-radius: 8px;
    }
    .leaflet-control-attribution a {
      color: ${PALETTE.onSurfaceVariant} !important;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    (function () {
      var map = L.map('map', {
        zoomControl: false,
        attributionControl: false
      }).setView([${initialLat}, ${initialLng}], ${zoom});

      L.control.attribution({ position: 'bottomleft', prefix: false })
        .addAttribution(${JSON.stringify(attributionHtml)})
        .addTo(map);

      var primaryTiles = L.tileLayer(
        ${JSON.stringify(hasCartoKey ? cartoTileUrl : osmTileUrl)},
        ${
          hasCartoKey
            ? `{
          subdomains: 'abcd',
          maxZoom: 20
        }`
            : `{
          maxZoom: 19
        }`
        }
      ).addTo(map);

      ${
        hasCartoKey
          ? `var fallbackLoaded = false;
      var tileErrors = 0;
      primaryTiles.on('tileerror', function () {
        tileErrors++;
        if (tileErrors >= 3 && !fallbackLoaded) {
          fallbackLoaded = true;
          map.removeLayer(primaryTiles);
          L.tileLayer(${JSON.stringify(osmTileUrl)}, {
            maxZoom: 19
          }).addTo(map);
        }
      });`
          : ''
      }

      var routeLine = null;
      var startMarker = null;
      var endMarker = null;
      var userHalo = null;
      var userDot = null;
      var hasAutoFocused = false;

      window.__updateMapState = function (payload) {
        if (!payload) return;
        var loc = payload.currentLocation;
        var coords = payload.routeCoordinates || [];
        var isTracking = !!payload.isTracking;
        var forceFit = !!payload.forceFit;

        // Route Polyline
        if (coords.length > 1) {
          if (!routeLine) {
            routeLine = L.polyline(coords, {
              color: '${PALETTE.accent}',
              weight: 5,
              opacity: 0.96,
              lineCap: 'round',
              lineJoin: 'round'
            }).addTo(map);
          } else {
            routeLine.setLatLngs(coords);
          }
        } else if (routeLine) {
          map.removeLayer(routeLine);
          routeLine = null;
        }

        // Start Marker
        if (coords.length > 0) {
          var startLatLng = coords[0];
          if (!startMarker) {
            startMarker = L.circleMarker(startLatLng, {
              radius: 6,
              color: '${PALETTE.surfaceRaised}',
              weight: 2.5,
              fillColor: '${PALETTE.surfaceInverse}',
              fillOpacity: 1
            }).addTo(map);
          } else {
            startMarker.setLatLng(startLatLng);
          }
        } else if (startMarker) {
          map.removeLayer(startMarker);
          startMarker = null;
        }

        // Finish Marker when viewing completed route
        if (!isTracking && coords.length > 1) {
          var endLatLng = coords[coords.length - 1];
          if (!endMarker) {
            endMarker = L.circleMarker(endLatLng, {
              radius: 6,
              color: '${PALETTE.surfaceRaised}',
              weight: 2.5,
              fillColor: '${PALETTE.accent}',
              fillOpacity: 1
            }).addTo(map);
          } else {
            endMarker.setLatLng(endLatLng);
          }
        } else if (endMarker) {
          map.removeLayer(endMarker);
          endMarker = null;
        }

        // Current User GPS Location Dot (shown during tracking or before workout starts)
        var showUserDot = !!loc && (isTracking || coords.length <= 1);
        if (showUserDot) {
          var userLatLng = [loc.latitude, loc.longitude];
          if (!userHalo) {
            userHalo = L.circleMarker(userLatLng, {
              radius: 15,
              stroke: false,
              fillColor: '${PALETTE.accent}',
              fillOpacity: 0.22
            }).addTo(map);
            userDot = L.circleMarker(userLatLng, {
              radius: 6.5,
              color: '${PALETTE.surfaceRaised}',
              weight: 2.5,
              fillColor: '${PALETTE.accent}',
              fillOpacity: 1
            }).addTo(map);
          } else {
            userHalo.setLatLng(userLatLng);
            userDot.setLatLng(userLatLng);
          }
        } else {
          if (userHalo) { map.removeLayer(userHalo); userHalo = null; }
          if (userDot) { map.removeLayer(userDot); userDot = null; }
        }

        // Camera Focus
        if (!isTracking && coords.length > 1 && (!hasAutoFocused || forceFit)) {
          hasAutoFocused = true;
          var bounds = L.latLngBounds(coords);
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [28, 28], maxZoom: 17, animate: forceFit });
          }
        } else if (loc && (isTracking || !hasAutoFocused || forceFit)) {
          if (!hasAutoFocused) {
            hasAutoFocused = true;
            map.setView([loc.latitude, loc.longitude], 16, { animate: false });
          } else {
            map.panTo([loc.latitude, loc.longitude], { animate: true, duration: 0.45 });
          }
        }
      };

      window.__centerMap = function (payload) {
        if (!payload) return;
        var coords = payload.routeCoordinates || [];
        var loc = payload.currentLocation;
        var isTracking = !!payload.isTracking;

        if (!isTracking && coords.length > 1) {
          var bounds = L.latLngBounds(coords);
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [28, 28], maxZoom: 17, animate: true });
            return;
          }
        }
        if (loc) {
          map.setView([loc.latitude, loc.longitude], 16, { animate: true });
        }
      };

      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage('MAP_READY');
      }
    })();
  </script>
</body>
</html>`;
}

export function WorkoutMap({ currentLocation, routeCoordinates, isTracking }: WorkoutMapProps) {
  const webViewRef = useRef<WebView<WebViewProps> | null>(null);
  const isMapReadyRef = useRef(false);

  const [webSource] = useState(() => {
    const initialPoint = currentLocation ?? DEFAULT_COORD;
    const html = buildLeafletHtml(
      initialPoint.latitude,
      initialPoint.longitude,
      Boolean(currentLocation),
      MAP_CONFIG.cartoApiKey
    );
    return { html, baseUrl: 'https://walkthetalk.app' };
  });

  const latestPayload = useMemo(
    () => ({
      currentLocation,
      routeCoordinates: routeCoordinates.map((c) => [c.latitude, c.longitude] as [number, number]),
      isTracking: Boolean(isTracking),
      forceFit: false,
    }),
    [currentLocation, routeCoordinates, isTracking]
  );

  const latestPayloadRef = useRef(latestPayload);

  const pushLatestToWebView = useCallback(() => {
    if (!isMapReadyRef.current || !webViewRef.current) return;
    const serialized = JSON.stringify(latestPayloadRef.current);
    webViewRef.current.injectJavaScript(
      `window.__updateMapState && window.__updateMapState(${serialized}); true;`
    );
  }, []);

  useEffect(() => {
    latestPayloadRef.current = latestPayload;
    pushLatestToWebView();
  }, [latestPayload, pushLatestToWebView]);

  const handleWebViewMessage = useCallback(
    (event: WebViewMessageEvent) => {
      if (event.nativeEvent.data === 'MAP_READY') {
        isMapReadyRef.current = true;
        pushLatestToWebView();
      }
    },
    [pushLatestToWebView]
  );

  const handleLoadEnd = useCallback(() => {
    if (!isMapReadyRef.current) {
      isMapReadyRef.current = true;
      pushLatestToWebView();
    }
  }, [pushLatestToWebView]);

  const handleCenterOnUser = useCallback(() => {
    if (!isMapReadyRef.current || !webViewRef.current) return;
    const serialized = JSON.stringify(latestPayloadRef.current);
    webViewRef.current.injectJavaScript(
      `window.__centerMap && window.__centerMap(${serialized}); true;`
    );
  }, []);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webFallbackContainer}>
        <Map size={40} strokeWidth={2} color={PALETTE.onSurfaceVariant} />
        <Text style={styles.webFallbackText}>
          Peta Interaktif tersedia di perangkat Android &amp; iOS.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView<WebViewProps>
        ref={webViewRef}
        style={styles.webview}
        originWhitelist={['*']}
        source={webSource}
        onMessage={handleWebViewMessage}
        onLoadEnd={handleLoadEnd}
        javaScriptEnabled
        domStorageEnabled
        nestedScrollEnabled
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
      />

      {(currentLocation || routeCoordinates.length > 1) && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pusatkan peta ke lokasi saya"
          style={({ pressed }) => [styles.centerButton, pressed && { opacity: 0.78 }]}
          onPress={handleCenterOnUser}
        >
          <LocateFixed size={18} strokeWidth={2} color={PALETTE.onSurface} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: PALETTE.surfaceAlt,
  },
  webview: {
    flex: 1,
    backgroundColor: PALETTE.surfaceAlt,
  },
  centerButton: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    backgroundColor: PALETTE.surfaceRaised,
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webFallbackContainer: {
    flex: 1,
    backgroundColor: PALETTE.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xxl,
  },
  webFallbackText: {
    ...TYPOGRAPHY.bodyMd,
    color: PALETTE.onSurfaceVariant,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
});
