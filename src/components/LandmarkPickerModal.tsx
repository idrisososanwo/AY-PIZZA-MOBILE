import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { DeliveryLandmark } from '../types/delivery';
import { PROVISIONAL_LANDMARKS } from '../domains/delivery/delivery-service';

interface LandmarkPickerModalProps {
  visible: boolean;
  selectedLandmark: DeliveryLandmark | null;
  onSelectLandmark: (landmark: DeliveryLandmark) => void;
  onClose: () => void;
}

export const LandmarkPickerModal: React.FC<LandmarkPickerModalProps> = ({
  visible,
  selectedLandmark,
  onSelectLandmark,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');

  const filtered = PROVISIONAL_LANDMARKS.filter((l) =>
    l.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Select Delivery Landmark</Text>
              <Text style={styles.subtitle}>UNILAG Campus & Surrounding Mainland</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Search Box */}
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search landmark (e.g. Akoka, Yaba, Inside School)..."
              placeholderTextColor="rgba(255, 232, 214, 0.4)"
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {/* Landmarks List */}
          <ScrollView
            style={styles.scrollList}
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 12, 24) }}
            showsVerticalScrollIndicator={false}
          >
            {filtered.map((landmark) => {
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
                    <Text style={styles.rateNote}>Provisional estimated delivery fee</Text>
                  </View>

                  <Text
                    style={[
                      styles.landmarkFee,
                      isSelected && styles.landmarkFeeSelected,
                    ]}
                  >
                    ₦{landmark.fee.toLocaleString()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: Colors.night,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 232, 214, 0.15)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 232, 214, 0.1)',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.frost,
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(255, 232, 214, 0.6)',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    color: Colors.frost,
    fontWeight: '700',
  },
  searchContainer: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 232, 214, 0.08)',
  },
  searchInput: {
    backgroundColor: Colors.royal,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Colors.frost,
    fontSize: 13,
    borderWidth: 1,
    borderColor: 'rgba(255, 232, 214, 0.15)',
  },
  scrollList: {
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  landmarkCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.royal,
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 232, 214, 0.12)',
  },
  landmarkCardSelected: {
    backgroundColor: 'rgba(217, 119, 6, 0.2)',
    borderColor: Colors.neon,
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
    color: Colors.frost,
    marginRight: 6,
  },
  landmarkNameSelected: {
    color: '#ffffff',
  },
  campusBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.4)',
  },
  campusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#4ade80',
  },
  rateNote: {
    fontSize: 11,
    color: 'rgba(255, 232, 214, 0.5)',
    marginTop: 2,
  },
  landmarkFee: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.neon,
  },
  landmarkFeeSelected: {
    color: '#ffffff',
  },
});
