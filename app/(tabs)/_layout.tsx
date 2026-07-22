import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/context/ThemeContext';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

import { View } from 'react-native';

function TabIcon({ name, focused }: { name: IoniconsName; focused: boolean }) {
  const colors = useColors();
  return (
    <View style={{
      alignItems: 'center',
      borderTopWidth: focused ? 2 : 0,
      borderTopColor: colors.tabBarActive,
      paddingTop: focused ? 4 : 6,
      width: '100%',
    }}>
      <Ionicons
        name={name}
        size={20}
        color={focused ? colors.tabBarActive : colors.tabBarInactive}
      />
    </View>
  );
}

export default function TabsLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const TAB_HEIGHT = 52 + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopWidth: 1,
          borderTopColor: '#1e1e1e',
          elevation: 0,
          shadowOpacity: 0,
          height: TAB_HEIGHT,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 4,
          paddingTop: 0,
        },
        tabBarActiveTintColor: colors.tabBarActive,
        tabBarInactiveTintColor: colors.tabBarInactive,
        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: '600',
          fontFamily: 'monospace',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        },
        headerStyle: { backgroundColor: colors.primary, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: '700', fontSize: 14, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 1 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ focused }) => <TabIcon name="home-outline" focused={focused} />,
          headerTitle: 'SIG / VIAL',
        }}
      />
      <Tabs.Screen
        name="mapa"
        options={{
          title: 'Mapa',
          tabBarIcon: ({ focused }) => <TabIcon name="map-outline" focused={focused} />,
          headerTitle: 'Mapa Vial',
        }}
      />
      <Tabs.Screen
        name="consorcios"
        options={{
          title: 'CC',
          tabBarIcon: ({ focused }) => <TabIcon name="business-outline" focused={focused} />,
          headerTitle: 'Consorcios',
        }}
      />
      <Tabs.Screen
        name="reportes"
        options={{
          title: 'Relev.',
          tabBarIcon: ({ focused }) => <TabIcon name="clipboard-outline" focused={focused} />,
          headerTitle: 'Relevamientos',
        }}
      />
    </Tabs>
  );
}
