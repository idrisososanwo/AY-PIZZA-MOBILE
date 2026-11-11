import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { DeliveryLandmark } from '../types/delivery';
import { PROVISIONAL_LANDMARKS, deliveryPricingEngine } from '../domains/delivery/delivery-service';
import { locationService } from '../domains/delivery/location-service';

export interface LandmarkPickerModalProps {
  visible: boolean;
  selectedLandmark: DeliveryLandmark | null;
  onSelectLandmark: (landmark: DeliveryLandmark) => void;
  onClose: () => void;
}

export const LANDMARK_CATEGORIES = [
  { id: 'all', label: 'All Areas (19)' },
  { id: 'zone-campus', label: '🏫 UNILAG Campus (Hostels & Faculties)' },
  { id: 'zone-near', label: '📍 Inner Environs (Akoka/Bariga)' },
  { id: 'zone-mid', label: '📍 Mid Environs (Yaba/Shomolu)' },
  { id: 'zone-far', label: '📍 Outer Environs (Surulere/Gbagada)' },
];

export const LandmarkPickerModal: React.FC<LandmarkPickerModalProps> = ({
  visible,
  selectedLandmark,
  onSelectLandmark,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [locating, setLocating] = useState(false);
  const [gpsResult, setGpsResult] = useState<{
    suggestedLandmark?: DeliveryLandmark;
    distanceFromStoreKm?: number;
    error?: string;
  } | null>(null);

  const allLandmarks = deliveryPricingEngine.getActiveLandmarks();
  const baseLandmarks = allLandmarks.length > 0 ? allLandmarks : PROVISIONAL_LANDMARKS;

  const filtered = baseLandmarks.filter((l) => {
    const matchesSearch = l.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || l.zoneId === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleDetectLocation = async () => {
    try {
      setLocating(true);
      setGpsResult(null);
      const result = await locationService.assistAddressSelection(baseLandmarks);

      if (result.success && result.suggestedLandmark) {
        setGpsResult({
          suggestedLandmark: result.suggestedLandmark,
          distanceFromStoreKm: result.distanceFromStoreKm,
        });
      } else {
        setGpsResult({
          error: result.error || 'Could not determine GPS location. Please select your landmark below.',
        });
      }
    } catch {
      setGpsResult({
        error: 'Location services encountered an error. Please select your landmark below.',
      });
    } finally {
      setLocating(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.title}>Select Delivery Landmark</Text>
              <Text style={styles.subtitle}>UNILAG Campus & Surrounding Lagos Mainland</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              activeOpacity={0.8}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 1. GPS LOCATION ASSIST CARD (Distinct from manual search) */}
          <View style={styles.gpsSection}>
            {locating ? (
              <View style={styles.gpsLoadingCard}>
                <ActivityIndicator size="small" color={Colors.brandRed} />
                <Text style={styles.gpsLoadingText}>Acquiring GPS coordinates & calculating distance...</Text>
              </View>
            ) : gpsResult?.suggestedLandmark ? (
              <View style={styles.gpsSuccessCard}>
                <View style={styles.gpsSuccessHeader}>
                  <Text style={styles.gpsSuccessTag}>📍 GPS DETECTED</Text>
                  <Text style={styles.gpsDistanceText}>
                    ~{gpsResult.distanceFromStoreKm} km from UNILAG kitchen
                  </Text>
                </View>

                <View style={styles.gpsSuggestedRow}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.gpsSuggestedTitle}>
                      {gpsResult.suggestedLandmark.name}
                    </Text>
                    <Text style={styles.gpsSuggestedFee}>
                      ₦{gpsResult.suggestedLandmark.fee.toLocaleString()} Delivery Fee •{' '}
                      {gpsResult.suggestedLandmark.isCampus ? 'UNILAG Campus' : 'Lagos Mainland'}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.gpsConfirmBtn}
                    onPress={() => {
                      onSelectLandmark(gpsResult.suggestedLandmark!);
                      onClose();
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.gpsConfirmBtnText}>Select Landmark ✓</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.gpsResetBtn}
                  onPress={() => setGpsResult(null)}
                >
                  <Text style={styles.gpsResetBtnText}>Clear GPS suggestion</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <TouchableOpacity
                  style={styles.gpsActionBtn}
                  onPress={handleDetectLocation}
                  activeOpacity={0.85}
                >
                  <Text style={styles.gpsActionIcon}>📍</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.gpsActionTitle}>Use Current Location (GPS Assist)</Text>
                    <Text style={styles.gpsActionSubtitle}>
                      Auto-detects closest landmark & calculates official delivery tariff
                    </Text>
                  </View>
                  <Text style={styles.gpsActionArrow}>›</Text>
                </TouchableOpacity>

                {gpsResult?.error && (
                  <View style={styles.gpsErrorBanner}>
                    <Text style={styles.gpsErrorText}>ℹ️ {gpsResult.error}</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* 2. MANUAL LANDMARK SEARCH (High-contrast input) */}
          <View style={styles.searchSection}>
            <Text style={styles.searchSectionLabel}>Or Search Landmark Manually:</Text>
            <View style={styles.searchContainer}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search landmark (e.g. Akoka, Yaba, Jaja, Surulere)..."
                placeholderTextColor="#85746E"
                selectionColor={Colors.brandRed}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {search.length > 0 && (
                <TouchableOpacity
                  onPress={() => setSearch('')}
                  style={styles.clearBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.clearBtnText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Logical Category Chips based on verified zones */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryChipsRow}
            >
              {LANDMARK_CATEGORIES.map((cat) => {
                const isActive = selectedCategory === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.categoryChip, isActive && styles.categoryChipActive]}
                    onPress={() => setSelectedCategory(cat.id)}
                    activeOpacity={0.8}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        isActive && styles.categoryChipTextActive,
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* 3. LANDMARKS LIST */}
          <ScrollView
            style={styles.scrollList}
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 16, 28) }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {filtered.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyEmoji}>📍</Text>
                <Text style={styles.emptyTitle}>No matching landmark found</Text>
                <Text style={styles.emptySubtitle}>
                  {`No delivery area matches "${search}" in this category. Reset filters to view all areas:`}
                </Text>
                <TouchableOpacity
                  style={styles.resetBtn}
                  onPress={() => {
                    setSearch('');
                    setSelectedCategory('all');
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.resetBtnText}>View All 19 Supported Landmarks</Text>
                </TouchableOpacity>
              </View>
            ) : (
              filtered.map((landmark) => {
                const isSelected = selectedLandmark?.id === landmark.id;
                return (
                  <TouchableOpacity
                    key={landmark.id}
                    style={[styles.landmarkCard, isSelected && styles.landmarkCardSelected]}
                    onPress={() => {
                      onSelectLandmark(landmark);
                      onClose();
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={styles.landmarkInfo}>
                      <View style={styles.landmarkTitleRow}>
                        <Text
                          style={[
                            styles.landmarkName,
                            isSelected && styles.landmarkNameSelected,
                          ]}
                        >
                          {landmark.name}
                        </Text>
                        {landmark.isCampus && (
                          <View style={styles.campusBadge}>
                            <Text style={styles.campusBadgeText}>CAMPUS</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.rateNote}>
                        {landmark.isCampus
                          ? 'UNILAG Campus delivery • Est. 15–25 mins'
                          : 'Lagos Mainland delivery • Est. 25–45 mins'}
                      </Text>
                    </View>

                    <View style={styles.feeContainer}>
                      <Text
                        style={[
                          styles.landmarkFee,
                          isSelected && styles.landmarkFeeSelected,
                        ]}
                      >
                        ₦{landmark.fee.toLocaleString()}
                      </Text>
                      {isSelected && (
                        <View style={styles.selectedPill}>
                          <Text style={styles.selectedPillText}>SELECTED</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: Colors.warmCream,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(62, 39, 35, 0.1)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.brandCharcoal,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(62, 39, 35, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    color: Colors.brandCharcoal,
    fontWeight: '700',
  },
  gpsSection: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  gpsActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: Colors.brandRed,
    borderRadius: 14,
    padding: 12,
    shadowColor: Colors.brandRed,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  gpsActionIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  gpsActionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.brandRed,
  },
  gpsActionSubtitle: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  gpsActionArrow: {
    fontSize: 18,
    color: Colors.brandRed,
    fontWeight: '700',
    marginLeft: 6,
  },
  gpsLoadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(62, 39, 35, 0.1)',
  },
  gpsLoadingText: {
    marginLeft: 10,
    fontSize: 12,
    fontWeight: '600',
    color: Colors.brandCharcoal,
  },
  gpsSuccessCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#16A34A',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  gpsSuccessHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  gpsSuccessTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#166534',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  gpsDistanceText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  gpsSuggestedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  gpsSuggestedTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.brandCharcoal,
  },
  gpsSuggestedFee: {
    fontSize: 12,
    color: '#15803D',
    fontWeight: '700',
    marginTop: 2,
  },
  gpsConfirmBtn: {
    backgroundColor: Colors.brandRed,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  gpsConfirmBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  gpsResetBtn: {
    alignSelf: 'center',
    marginTop: 8,
    paddingVertical: 4,
  },
  gpsResetBtnText: {
    fontSize: 11,
    color: Colors.textSecondary,
    textDecorationLine: 'underline',
  },
  gpsErrorBanner: {
    backgroundColor: '#FFFBEB',
    padding: 10,
    borderRadius: 8,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  gpsErrorText: {
    fontSize: 11,
    color: '#92400E',
    lineHeight: 16,
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  searchSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.brandCharcoal,
    marginBottom: 6,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(62, 39, 35, 0.16)',
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    color: '#1F1F1F',
    backgroundColor: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
  },
  clearBtn: {
    padding: 6,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearBtnText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  categoryChipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 10,
    paddingBottom: 2,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(62, 39, 35, 0.16)',
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryChipActive: {
    backgroundColor: Colors.brandRed,
    borderColor: Colors.brandRed,
  },
  categoryChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.brandCharcoal,
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  scrollList: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  landmarkCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(62, 39, 35, 0.1)',
  },
  landmarkCardSelected: {
    backgroundColor: '#FFF3F3',
    borderColor: Colors.brandRed,
    borderWidth: 1.5,
  },
  landmarkInfo: {
    flex: 1,
    marginRight: 10,
  },
  landmarkTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  landmarkName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.brandCharcoal,
    marginRight: 6,
  },
  landmarkNameSelected: {
    color: Colors.brandRed,
    fontWeight: '800',
  },
  campusBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  campusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#166534',
  },
  rateNote: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 15,
  },
  feeContainer: {
    alignItems: 'flex-end',
  },
  landmarkFee: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.brandRed,
  },
  landmarkFeeSelected: {
    color: Colors.brandRed,
  },
  selectedPill: {
    backgroundColor: Colors.brandRed,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  selectedPillText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyEmoji: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.brandCharcoal,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
    lineHeight: 17,
  },
  resetBtn: {
    backgroundColor: Colors.brandRed,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  resetBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
