cmake_minimum_required(VERSION 3.22)

project(fix_wrapper_cpp LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

add_executable(fix-wrapper-cpp
  src/main.cpp
  src/kafka_producer.cpp
  src/buffered_publisher.cpp
  src/metrics.cpp
  src/metrics_server.cpp
  src/redis_status.cpp
  src/ring_buffer.cpp
)

target_include_directories(fix-wrapper-cpp PRIVATE
  /opt/onixs/include
)

target_link_directories(fix-wrapper-cpp PRIVATE
  /opt/onixs/lib
)

target_link_libraries(fix-wrapper-cpp PRIVATE
  "-Wl,--no-as-needed"
  /opt/onixs/lib/libonixs-fix-engine.so
  "-Wl,--as-needed"
  rdkafka++
  rdkafka
  hiredis
  civetweb
  pthread
  dl
)

set_target_properties(fix-wrapper-cpp PROPERTIES
  BUILD_RPATH "/opt/onixs/lib"
  INSTALL_RPATH "/opt/onixs/lib"
)
