// ▼▼▼ 変更点: 変数をグローバルスコープで宣言 ▼▼▼
let adScreen, mainContent, adVideo;

// ▼▼▼ 変更点: goToAdScreen関数をグローバルスコープに移動 ▼▼▼
function goToAdScreen() {
    if (mainContent && adScreen && adVideo) {
        mainContent.classList.add('hidden');
        adScreen.style.display = 'block';
        adVideo.volume = 1.0;
        adVideo.play();
        if (window.vueApp && window.vueApp.activeInfoWindow) {
            window.vueApp.activeInfoWindow.close();
        }
    }
}

// ページ読み込み完了時のイベント
document.addEventListener('DOMContentLoaded', () => {
    // ▼▼▼ 変更点: グローバル変数に実際の要素を代入 ▼▼▼
    adScreen = document.getElementById('ad-screen');
    mainContent = document.getElementById('main-content');
    adVideo = document.getElementById('ad-video');

    const adVideos = [
        'videos/ad_01.mp4',
        //'videos/ad_02.mp4',
        //'videos/ad_03.mp4',
        //'videos/ad_04.mp4',
        //'videos/ad_05.mp4',
        //'videos/ad_06.mp4',
        //'videos/ad_07.mp4',
        //'videos/ad_08.mp4',
        //'videos/ad_09.mp4',
        //'videos/ad_10.mp4'
    ];
    let currentVideoIndex = 0;

    adVideo.addEventListener('ended', () => {
        currentVideoIndex = (currentVideoIndex + 1) % adVideos.length;
        adVideo.src = adVideos[currentVideoIndex];
        adVideo.play();
    });
    adVideo.src = adVideos[0];

    let inactivityTimer;
    const inactivityTimeout = 90000;

    // ▲▲▲ 変更点: goToAdScreen関数はグローバルスコープに移動したため、ここからは削除 ▲▲▲

    function resetInactivityTimer() {
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(goToAdScreen, inactivityTimeout);
    }

    mainContent.addEventListener('click', resetInactivityTimer);
    mainContent.addEventListener('touchstart', resetInactivityTimer);
    mainContent.addEventListener('wheel', resetInactivityTimer, { passive: true });

    adScreen.addEventListener('click', () => {
        adScreen.style.display = 'none';
        mainContent.classList.remove('hidden');
        resetInactivityTimer();

        let volume = 1.0;
        const fadeOut = setInterval(() => {
            if (volume > 0.1) {
                volume -= 0.1;
                adVideo.volume = volume;
            } else {
                adVideo.pause();
                clearInterval(fadeOut);
            }
        }, 100);
    });
});


// Google Apps ScriptのウェブアプリURL
const gasUrl = 'https://script.google.com/macros/s/AKfycbySv6_IQrCvQYYkkkEd8ZbVIP4WHBCdwApvZ7vLHIq-aEw4pX44LsPJ5F5XLAE_NQVs/exec';

// Google Maps APIのコールバック関数
function initMap() {
    const app = Vue.createApp({
        data() {
            return {
                map: null,
                header: null,
                spots: [],
                markers: [],
                activeInfoWindow: null,
                isAnimating: false,
                animationFrameId: null,
                isHeaderExpanded: false,
                isEventDetailVisible: false,
                currentSpotForEvents: null,
                currentSpotEvents: [],
                isQrModalVisible: false,
                currentQrCode: '',
                activeVideoFades: {},
                eventObserver: null,
                // ▼▼▼ 追加: モーダル管理用のデータ ▼▼▼
                isPurchaseModalVisible: false,
                isLodgingModalVisible: false,
                modalTargetSpot: null,
                selectedLodgingPlan: null,
                // ▲▲▲ 追加 ▲▲▲
            };
        },
        mounted() {
            this.map = new google.maps.Map(document.getElementById('map'), {
                center: { lat: 36.390632, lng: 139.060418 },
                zoom: 12,
                gestureHandling: 'greedy'
            });

            this.map.addListener('click', () => {
                if (this.activeInfoWindow) {
                    this.activeInfoWindow.close();
                    this.activeInfoWindow = null;
                }
                this.hideEventDetail();
            });

            // bodyのクリックリスナーはInfoWindowからの呼び出しには使えないため、
            // 新しいモーダル関連の処理はVueのメソッドで行います。
            // 既存のイベントリスナーは残しておきます。
            document.body.addEventListener('click', (event) => {
                if (event.target.matches('.event-btn')) {
                    const spotName = event.target.dataset.spotName;
                    const spotData = this.spots.find(s => s.name === spotName);
                    if (spotData) this.showEventDetail(spotData);
                }
            });

            this.fetchSpots();
        },
        methods: {
            handleBackToAdClick() {
                goToAdScreen();
            },
            async fetchSpots() {
                try {
                    const response = await fetch(gasUrl);
                    if (!response.ok) {
                        throw new Error('データの取得に失敗しました。');
                    }
                    const data = await response.json();
                    this.header = data.header;
                    
                    // ▼▼▼ 変更: JSON文字列をパースする処理を追加 ▼▼▼
                    // スプレッドシートのlodging_plansが文字列になっている場合、JSONオブジェクトに変換する
                    this.spots = data.spots.map(spot => {
                        if (spot.lodging_plans && typeof spot.lodging_plans === 'string') {
                            try {
                                spot.lodging_plans = JSON.parse(spot.lodging_plans);
                            } catch (e) {
                                console.error('宿泊プランのJSON変換に失敗:', spot.name, e);
                                spot.lodging_plans = []; // エラーの場合は空にする
                            }
                        } else if (!spot.lodging_plans) {
                            spot.lodging_plans = []; // データがない場合も空配列をセット
                        }
                        return spot;
                    });
                    // ▲▲▲ 変更 ▲▲▲

                    this.placeMarkers();

                } catch (error)
                 {
                    console.error(error);
                    alert('エラーが発生しました。' + error.message);
                }
            },
            placeMarkers() {
                this.spots.forEach(spot => {
                    const position = {
                        lat: parseFloat(spot.latitude),
                        lng: parseFloat(spot.longitude)
                    };

                    // ▼▼▼ 変更箇所: spotにidがない場合は警告を出す ▼▼▼
                    if (!spot.id) {
                        console.warn('スポットにIDが設定されていません:', spot.name);
                    }
                    // ▲▲▲ 変更箇所 ▲▲▲

                    const marker = new google.maps.Marker({
                        position: position,
                        map: this.map,
                        title: spot.name
                    });

                    // ▼▼▼ 変更: InfoWindowの中身を大幅に変更 ▼▼▼
                    const spotImageHtml = spot.detail_image
                        ? `<img src="${spot.detail_image}" alt="${spot.name}" class="info-window-spot-image">`
                        : '';

                    let goodsHtml = '';
                    // 商品情報がある場合のみ表示
                    if (spot.goods_name) {
                        goodsHtml = `
                            <div class="info-window-goods">
                                <img src="${spot.goods_image || ''}" alt="${spot.goods_name}" class="info-window-goods-image">
                                <div class="info-window-goods-details">
                                    <strong>${spot.goods_name}</strong>
                                    <span>${spot.goods_price}</span>
                                </div>
                            </div>
                            <button class="info-window-btn purchase" onclick="window.vueApp.showPurchaseModal(${spot.id})">購入する</button>
                        `;
                    }
                    
                    let lodgingButtonHtml = '';
                    // 宿泊プラン情報がある場合のみ表示
                    if (spot.lodging_plans && spot.lodging_plans.length > 0) {
                        lodgingButtonHtml = `
                            <button class="info-window-btn lodging" onclick="window.vueApp.showLodgingModal(${spot.id})">宿泊プランを見る</button>
                        `;
                    }
                    
                    const infoWindow = new google.maps.InfoWindow({
                        content: `
                            <div class="info-window">
                                <h6 class="info-window-header">${spot.name}</h6>
                                <div class="info-window-content">
                                    ${spotImageHtml}
                                    ${goodsHtml}
                                    ${lodgingButtonHtml}
                                    <button class="event-btn" data-spot-name="${spot.name}">周辺のイベント情報はこちら</button>
                                </div>
                            </div>
                        `,
                        disableAutoPan: true
                    });
                    // ▲▲▲ 変更 ▲▲▲

                    marker.addListener('click', (e) => {
                        this.onSpotClick(spot.name);
                        e.domEvent.stopPropagation();
                    });

                    this.markers.push({ gmapMarker: marker, infoWindow: infoWindow, spotData: spot });
                });
            },
            onSpotClick(spotName) {
                if (this.isAnimating) {
                    cancelAnimationFrame(this.animationFrameId);
                    this.isAnimating = false;
                }

                const target = this.markers.find(m => m.spotData.name === spotName);
                if (target) {
                    this.openInfoWindow(target.infoWindow, target.spotData);
                    const destination = target.gmapMarker.getPosition();
                    this.flyTo(destination, 17.5);
                }
            },
            openInfoWindow(infoWindow, spotData) {
                if (this.activeInfoWindow) {
                    this.activeInfoWindow.close();
                }
                infoWindow.open({
                    anchor: this.markers.find(m => m.spotData.name === spotData.name).gmapMarker,
                    map: this.map,
                });
                this.activeInfoWindow = infoWindow;
            },
            easing(t) {
                return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
            },
            flyTo(destination, endZoom) {
                this.isAnimating = true;
                const duration = 2500;
                let startTime = null;

                const projection = this.map.getProjection();
                const destPoint = projection.fromLatLngToPoint(destination);
                const scale = Math.pow(2, endZoom);
                const offsetX = 100;
                const offsetY = 300;

                const offsetPoint = new google.maps.Point(
                    offsetX / scale,
                    offsetY / scale
                );

                const newCenterPoint = new google.maps.Point(
                    destPoint.x - offsetPoint.x,
                    destPoint.y - offsetPoint.y
                );

                const newCenterLatLng = projection.fromPointToLatLng(newCenterPoint);

                const p0 = {
                    lat: this.map.getCenter().lat(),
                    lng: this.map.getCenter().lng(),
                    zoom: this.map.getZoom()
                };
                const p2 = {
                    lat: newCenterLatLng.lat(),
                    lng: newCenterLatLng.lng(),
                    zoom: endZoom
                };

                const distance = Math.sqrt(Math.pow(p2.lat - p0.lat, 2) + Math.pow(p2.lng - p0.lng, 2));
                const arcHeight = Math.max(1.0, Math.min(distance * 20, 5.0));

                const p1 = {
                    lat: (p0.lat + p2.lat) / 2,
                    lng: (p0.lng + p2.lng) / 2,
                    zoom: Math.min(p0.zoom, p2.zoom) - arcHeight
                };

                const frame = (currentTime) => {
                    if (!startTime) startTime = currentTime;
                    const progress = Math.min((currentTime - startTime) / duration, 1);
                    const t = this.easing(progress);

                    const currentLat = Math.pow(1 - t, 2) * p0.lat + 2 * (1 - t) * t * p1.lat + Math.pow(t, 2) * p2.lat;
                    const currentLng = Math.pow(1 - t, 2) * p0.lng + 2 * (1 - t) * t * p1.lng + Math.pow(t, 2) * p2.lng;
                    const currentZoom = Math.pow(1 - t, 2) * p0.zoom + 2 * (1 - t) * t * p1.zoom + Math.pow(t, 2) * p2.zoom;

                    this.map.moveCamera({
                        center: { lat: currentLat, lng: currentLng },
                        zoom: currentZoom
                    });

                    if (progress < 1) {
                        this.animationFrameId = requestAnimationFrame(frame);
                    } else {
                        this.isAnimating = false;
                        this.animationFrameId = null;
                    }
                };
                this.animationFrameId = requestAnimationFrame(frame);
            },
            fadeVolume(refName, element, targetVolume, duration = 500) {
                if (!element) return;

                if (this.activeVideoFades[refName]) {
                    clearInterval(this.activeVideoFades[refName]);
                }

                const startVolume = element.volume;
                const interval = 20;
                const step = (targetVolume - startVolume) / (duration / interval);

                this.activeVideoFades[refName] = setInterval(() => {
                    const newVolume = element.volume + step;

                    if ((step > 0 && newVolume >= targetVolume) || (step < 0 && newVolume <= targetVolume)) {
                        element.volume = targetVolume;
                        clearInterval(this.activeVideoFades[refName]);
                        delete this.activeVideoFades[refName];
                    } else {
                        element.volume = newVolume;
                    }
                }, interval);
            },
            showEventDetail(spotData) {
                const events = [];
                for (let i = 1; i <= 3; i++) {
                    if (spotData[`event${i}_name`]) {
                        events.push({
                            name: spotData[`event${i}_name`],
                            datetime: spotData[`event${i}_datetime`],
                            location: spotData[`event${i}_location`],
                            description: spotData[`event${i}_description`],
                            prize: spotData[`event${i}_prize`],
                            qrcode: spotData[`event${i}_qrcode`],
                            image: spotData[`event${i}_image`]
                        });
                    }
                }
                this.currentSpotEvents = events;
                this.currentSpotForEvents = spotData;
                this.isEventDetailVisible = true;

                this.$nextTick(() => {
                    const scrollContainer = document.querySelector('.event-detail-content');
                    if (!scrollContainer) return;

                    const observerOptions = {
                        root: scrollContainer,
                        rootMargin: '0px',
                        threshold: 0.5
                    };

                    this.eventObserver = new IntersectionObserver((entries) => {
                        entries.forEach(entry => {
                            const videoEl = entry.target;
                            const refName = videoEl.dataset.refName;

                            if (entry.isIntersecting) {
                                videoEl.volume = 0;
                                videoEl.play().catch(e => console.error("Video play failed:", e));
                                this.fadeVolume(refName, videoEl, 0.5, 500);
                            } else {
                                this.fadeVolume(refName, videoEl, 0, 500);
                            }
                        });
                    }, observerOptions);

                    const videoElements = document.querySelectorAll('.event-video');
                    videoElements.forEach(video => {
                        this.eventObserver.observe(video);
                    });
                });
            },
            hideEventDetail() {
                if (!this.isEventDetailVisible) return;

                if (this.eventObserver) {
                    this.eventObserver.disconnect();
                    this.eventObserver = null;
                }

                this.isEventDetailVisible = false;
                this.currentSpotEvents = [];
                this.currentSpotForEvents = null;
            },
            showQrCode(qrCodeUrl) {
                this.currentQrCode = qrCodeUrl;
                this.isQrModalVisible = true;
            },
            hideQrCode() {
                this.isQrModalVisible = false;
            },

            // ▼▼▼ 追加: 新しいモーダル関連のメソッド ▼▼▼
            showPurchaseModal(spotId) {
                this.modalTargetSpot = this.spots.find(s => s.id === spotId);
                if (this.modalTargetSpot) {
                    this.isPurchaseModalVisible = true;
                }
            },
            hidePurchaseModal() {
                this.isPurchaseModalVisible = false;
            },
            showLodgingModal(spotId) {
                this.modalTargetSpot = this.spots.find(s => s.id === spotId);
                if (this.modalTargetSpot) {
                    this.selectedLodgingPlan = null; // 宿泊プランの選択状態をリセット
                    this.isLodgingModalVisible = true;
                }
            },
            hideLodgingModal() {
                this.isLodgingModalVisible = false;
            },
            selectLodgingPlan(plan) {
                this.selectedLodgingPlan = plan;
            },
            openLink(url) {
                if (url) {
                    window.open(url, '_blank');
                } else {
                    alert('リンク先が設定されていません。');
                }
            }
            // ▲▲▲ 追加 ▲▲▲
        }
    });
    // Vueインスタンスをグローバルにアクセス可能にする
    window.vueApp = app.mount('#app');
}