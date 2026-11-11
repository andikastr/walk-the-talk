import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, WebViewMessageEvent, WebViewProps } from 'react-native-webview';
import { LocateFixed, Map, WifiOff } from 'lucide-react-native';
import { GPSCoordinate } from '@/types/workout';
import { RADIUS, SPACING, ThemePalette, TYPOGRAPHY } from '@/constants/Colors';
import { MAP_CONFIG } from '@/constants/Config';
import { usePreferences } from '@/context/AppPreferencesContext';
import { LEAFLET_CSS, LEAFLET_JS } from '@/components/map/leafletInlineAssets';

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
  cartoApiKey: string,
  isDark: boolean,
  palette: ThemePalette,
  htmlLang: string
): string {
  const zoom = hasInitialCoord ? 16 : 12;
  const trimmedKey = cartoApiKey.trim();
  const hasCartoKey = trimmedKey.length > 0;
  const cartoStyle = isDark ? 'dark_all' : 'light_all';
  const cartoTileUrl = hasCartoKey
    ? `https://{s}.basemaps.cartocdn.com/${cartoStyle}/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(trimmedKey)}`
    : '';
  const osmTileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const attributionHtml = hasCartoKey
    ? '&copy; OpenStreetMap &copy; CARTO'
    : '&copy; OpenStreetMap';
  const attributionBg = isDark ? 'rgba(14, 15, 12, 0.85)' : 'rgba(244, 242, 236, 0.85)';
  const markerStrokeColor = isDark ? palette.surfaceFeature : palette.surfaceRaised;
  const gridLineColor = isDark
    ? 'rgba(244, 242, 236, 0.045)'
    : 'rgba(14, 15, 12, 0.045)';

  return `<!DOCTYPE html>
<html lang="${htmlLang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>${LEAFLET_CSS}</style>
  <style>
    * { box-sizing: border-box; }
    html, body, #map {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background-color: ${palette.surfaceAlt};
      background-image:
        linear-gradient(to right, ${gridLineColor} 1px, transparent 1px),
        linear-gradient(to bottom, ${gridLineColor} 1px, transparent 1px);
      background-size: 28px 28px;
      overflow: hidden;
      -webkit-tap-highlight-color: transparent;
    }
    .leaflet-container {
      background: transparent !important;
    }
    .osm-dark-fallback {
      filter: brightness(0.6) invert(1) contrast(2.6) hue-rotate(200deg) saturate(0.35) brightness(0.75);
    }
    .leaflet-control-attribution {
      font-family: sans-serif;
      font-size: 9px !important;
      background: ${attributionBg} !important;
      color: ${palette.onSurfaceVariant} !important;
      padding: 2px 6px !important;
      border-top-right-radius: 8px;
    }
    .leaflet-control-attribution a {
      color: ${palette.onSurfaceVariant} !important;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>${LEAFLET_JS}</script>
  <script>
    (function () {
      var map = L.map('map', {
        zoomControl: false,
        attributionControl: false
      }).setView([${initialLat}, ${initialLng}], ${zoom});

      L.control.attribution({ position: 'bottomleft', prefix: false })
        .addAttribution(${JSON.stringify(attributionHtml)})
        .addTo(map);

      var hasAnyTileLoaded = false;
      var offlineTileErrors = 0;
      var wasOfflineSent = false;

      function postToNative(msg) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(msg);
        }
      }

      function attachOfflineDetector(layer) {
        layer.on('tileload', function () {
          hasAnyTileLoaded = true;
          offlineTileErrors = 0;
          if (wasOfflineSent) {
            wasOfflineSent = false;
            postToNative('TILES_ONLINE');
          }
        });
        layer.on('tileerror', function () {
          offlineTileErrors++;
          if (offlineTileErrors >= 3 && !hasAnyTileLoaded && !wasOfflineSent) {
            wasOfflineSent = true;
            postToNative('TILES_OFFLINE');
          }
        });
      }

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

      primaryTiles.on('tileload', function () {
        hasAnyTileLoaded = true;
        offlineTileErrors = 0;
        if (wasOfflineSent) {
          wasOfflineSent = false;
          postToNative('TILES_ONLINE');
        }
      });

      if (${isDark ? 'true' : 'false'} && ${hasCartoKey ? 'false' : 'true'}) {
        var tilePaneInit = document.querySelector('.leaflet-tile-pane');
        if (tilePaneInit) tilePaneInit.classList.add('osm-dark-fallback');
      }

      ${
        hasCartoKey
          ? `var fallbackLoaded = false;
      var tileErrors = 0;
      primaryTiles.on('tileerror', function () {
        tileErrors++;
        if (tileErrors >= 3 && !fallbackLoaded) {
          fallbackLoaded = true;
          map.removeLayer(primaryTiles);
          var osmFallback = L.tileLayer(${JSON.stringify(osmTileUrl)}, {
            maxZoom: 19
          }).addTo(map);
          attachOfflineDetector(osmFallback);
          if (${isDark ? 'true' : 'false'}) {
            var tilePane = document.querySelector('.leaflet-tile-pane');
            if (tilePane) tilePane.classList.add('osm-dark-fallback');
          }
        }
      });`
          : `attachOfflineDetector(primaryTiles);`
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
        var segments = payload.routeSegments || [];
        var drawableSegments = segments.filter(function (seg) { return seg.length > 1; });
        var isTracking = !!payload.isTracking;
        var forceFit = !!payload.forceFit;

        // Route Polyline (supports multi-segment breaks so pause gaps never connect straight across)
        if (drawableSegments.length > 0) {
          if (!routeLine) {
            routeLine = L.polyline(drawableSegments, {
              color: '${palette.accent}',
              weight: 5,
              opacity: 0.96,
              lineCap: 'round',
              lineJoin: 'round'
            }).addTo(map);
          } else {
            routeLine.setLatLngs(drawableSegments);
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
              color: '${markerStrokeColor}',
              weight: 2.5,
              fillColor: '${palette.actionPrimary}',
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
              color: '${markerStrokeColor}',
              weight: 2.5,
              fillColor: '${palette.accent}',
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
              fillColor: '${palette.accent}',
              fillOpacity: 0.22
            }).addTo(map);
            userDot = L.circleMarker(userLatLng, {
              radius: 6.5,
              color: '${markerStrokeColor}',
              weight: 2.5,
              fillColor: '${palette.accent}',
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
  const { palette, isDark, language, t } = usePreferences();
  const webViewRef = useRef<WebView<WebViewProps> | null>(null);
  const isMapReadyRef = useRef(false);
  const [offlineHtmlKey, setOfflineHtmlKey] = useState<string | null>(null);
  const [initialAnchor] = useState<{ latitude: number; longitude: number } | null>(
    () => currentLocation
  );

  const webSource = useMemo(() => {
    const anchor = initialAnchor ?? DEFAULT_COORD;
    const html = buildLeafletHtml(
      anchor.latitude,
      anchor.longitude,
      Boolean(initialAnchor),
      MAP_CONFIG.cartoApiKey,
      isDark,
      palette,
      language
    );
    return { html, baseUrl: 'https://walkthetalk.app' };
  }, [initialAnchor, isDark, palette, language]);

  const latestPayload = useMemo(() => {
    const flatCoords: [number, number][] = [];
    const routeSegments: [number, number][][] = [];
    let activeSegIndex: number | null = null;

    for (const pt of routeCoordinates) {
      const segIdx = pt.segmentIndex ?? 0;
      const pair: [number, number] = [pt.latitude, pt.longitude];
      flatCoords.push(pair);

      if (activeSegIndex === null || segIdx !== activeSegIndex) {
        routeSegments.push([pair]);
        activeSegIndex = segIdx;
      } else {
        routeSegments[routeSegments.length - 1].push(pair);
      }
    }

    return {
      currentLocation,
      routeCoordinates: flatCoords,
      routeSegments,
      isTracking: Boolean(isTracking),
      forceFit: false,
    };
  }, [currentLocation, routeCoordinates, isTracking]);

  const latestPayloadRef = useRef(latestPayload);

  const pushLatestToWebView = useCallback(() => {
    if (!isMapReadyRef.current || !webViewRef.current) return;
    const serialized = JSON.stringify(latestPayloadRef.current);
    webViewRef.current.injectJavaScript(
      `window.__updateMapState && window.__updateMapState(${serialized}); true;`
    );
  }, []);

  const tilesOffline = offlineHtmlKey === webSource.html;

  useEffect(() => {
    isMapReadyRef.current = false;
  }, [webSource]);

  useEffect(() => {
    latestPayloadRef.current = latestPayload;
    pushLatestToWebView();
  }, [latestPayload, pushLatestToWebView]);

  const handleWebViewMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const msg = event.nativeEvent.data;
      if (msg === 'MAP_READY') {
        isMapReadyRef.current = true;
        pushLatestToWebView();
      } else if (msg === 'TILES_OFFLINE') {
        setOfflineHtmlKey(webSource.html);
      } else if (msg === 'TILES_ONLINE') {
        setOfflineHtmlKey(null);
      }
    },
    [pushLatestToWebView, webSource.html]
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
      <View style={[styles.webFallbackContainer, { backgroundColor: palette.surfaceAlt }]}>
        <Map size={40} strokeWidth={2} color={palette.onSurfaceVariant} />
        <Text style={[styles.webFallbackText, { color: palette.onSurfaceVariant }]}>
          {t.map.webFallback}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: palette.surfaceAlt }]}>
      <WebView<WebViewProps>
        key={isDark ? 'map-dark' : 'map-light'}
        ref={webViewRef}
        style={[styles.webview, { backgroundColor: palette.surfaceAlt }]}
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

      {tilesOffline && (
        <View
          pointerEvents="none"
          style={[
            styles.offlineBadge,
            {
              backgroundColor: palette.surfaceRaised,
              borderColor: palette.border,
            },
          ]}
        >
          <WifiOff size={12} strokeWidth={2} color={palette.onSurfaceVariant} />
          <Text
            style={[styles.offlineBadgeText, { color: palette.onSurfaceVariant }]}
            numberOfLines={1}
          >
            {t.map.offlineBadge}
          </Text>
        </View>
      )}

      {(currentLocation || routeCoordinates.length > 1) && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.map.centerA11y}
          style={({ pressed }) => [
            styles.centerButton,
            { backgroundColor: palette.surfaceRaised },
            isDark && { borderWidth: 1, borderColor: palette.border },
            pressed && { opacity: 0.78 },
          ]}
          onPress={handleCenterOnUser}
        >
          <LocateFixed size={18} strokeWidth={2} color={palette.onSurface} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
  },
  centerButton: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  offlineBadgeText: {
    ...TYPOGRAPHY.labelSm,
  },
  webFallbackContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xxl,
  },
  webFallbackText: {
    ...TYPOGRAPHY.bodyMd,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
});
