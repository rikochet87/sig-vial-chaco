import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/context/ThemeContext';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, focused }: { name: IoniconsName; focused: boolean }) {
  const colors = useColors();
  return (
    <Ionicons
      name={name}
      size={24}
      color={focused ? colors.tabBarActive : colors.tabBarInactive}
    />
  );
}

export default function TabsLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  // Altura total = contenido fijo (52) + safe area bottom
  const TAB_HEIGHT = 52 + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopWidth: 0,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.15,
          shadowRadius: 4,
          height: TAB_HEIGHT,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 6,
          paddingTop: 6,
        },
        tabBarActiveTintColor: colors.tabBarActive,
        tabBarInactiveTintColor: colors.tabBarInactive,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: 'bold', fontSize: 18 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'home' : 'home-outline'} focused={focused} />,
          headerTitle: 'SIG Vial Chaco',
        }}
      />
      <Tabs.Screen
        name="mapa"
        options={{
          title: 'Mapa',
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'map' : 'map-outline'} focused={focused} />,
          headerTitle: 'Mapa Vial',
        }}
      />
      <Tabs.Screen
        name="consorcios"
        options={{
          title: 'Consorcios',
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'business' : 'business-outline'} focused={focused} />,
          headerTitle: 'Consorcios',
        }}
      />
      <Tabs.Screen
        name="reportes"
        options={{
          title: 'Relevamientos',
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'clipboard' : 'clipboard-outline'} focused={focused} />,
          headerTitle: 'Relevamientos',
        }}
      />
    </Tabs>
  );
}
