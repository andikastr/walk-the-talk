import React from 'react';
import { Tabs } from 'expo-router';
import { FloatingTabBar } from '@/components/ui/FloatingTabBar';
import { usePreferences } from '@/context/AppPreferencesContext';

export default function TabLayout() {
  const { palette, t } = usePreferences();

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: palette.surface },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t.tabs.home,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: t.tabs.history,
        }}
      />
      <Tabs.Screen
        name="record"
        options={{
          title: t.tabs.record,
        }}
      />
      <Tabs.Screen
        name="music"
        options={{
          title: t.tabs.music,
        }}
      />
      {/* Sembunyikan tab template bawaan */}
      <Tabs.Screen
        name="two"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
