import React from 'react';
import { Tabs } from 'expo-router';
import { PALETTE } from '@/constants/Colors';
import { FloatingTabBar } from '@/components/ui/FloatingTabBar';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: PALETTE.surface },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Beranda',
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Riwayat',
        }}
      />
      <Tabs.Screen
        name="record"
        options={{
          title: 'Rekam',
        }}
      />
      <Tabs.Screen
        name="music"
        options={{
          title: 'Musik',
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
